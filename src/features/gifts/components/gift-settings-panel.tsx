"use client";
/* eslint-disable @next/next/no-img-element -- QR images must retain their original pixels. */

import { resolveMediaUrl } from "@/core/config/media-url";
import { Eye, Wallet, Hash } from "lucide-react";
import styles from "./gift-settings-panel.module.css";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import {
  getGiftAccounts,
  getGiftBanks,
  linkGiftBankHub,
  syncGiftBankHub,
  type GiftBankAccount,
} from "../api/gifts.api";
import { BankHubLinkDialog } from "./bank-hub-link-dialog";
import { Modal } from "@/shared/ui/modal";
import { Button } from "@/shared/ui/button";
import {
  validManualGiftRecipient,
  manualGiftQrUrl,
  type GiftSettings,
} from "@/shared/api/invitation-gift-settings";

export function GiftCardsPreview({
  settings,
  accounts = [],
  banks = [],
}: {
  settings?: GiftSettings;
  accounts?: GiftBankAccount[];
  banks?: { bin: string; name: string }[];
}) {
  const recipients = settings?.recipients.filter((r) => r.enabled) ?? [];
  if (!recipients.length) return <p>Hộp quà mừng chưa được cấu hình. Chọn widget để thêm mã QR.</p>;
  return (
    <div className={`grid gap-4 ${recipients.length > 1 ? "sm:grid-cols-2" : ""}`}>
      {recipients.map((r) => {
        const account =
          settings?.mode === "MANUAL" && validManualGiftRecipient(r)
            ? {
                bankBin: r.bankBin ?? "",
                accountNumber: r.accountNumber ?? "",
                accountName: "",
                bankName: banks.find((b) => b.bin === r.bankBin)?.name ?? r.bankBin,
              }
            : accounts.find((a) => a.id === r.accountId && a.bankHubLinked);
        const url =
          settings?.mode === "UPLOADED"
            ? r.imageUrl
            : account
              ? manualGiftQrUrl(account.bankBin, account.accountNumber, account.accountName)
              : undefined;
        return (
          <article
            key={r.role}
            className="min-w-0 rounded-xl border bg-white p-3 text-center text-stone-800"
          >
            <h3 className="mb-3 font-semibold">{r.role === "BRIDE" ? "Cô dâu" : "Chú rể"}</h3>
            {url ? (
              <img
                src={resolveMediaUrl(url) ?? url}
                alt={`QR ${r.role === "BRIDE" ? "cô dâu" : "chú rể"}`}
                className="mx-auto h-auto max-h-[55dvh] max-w-full object-contain"
              />
            ) : (
              <p className="text-sm">Chưa có mã QR hợp lệ.</p>
            )}
            {account && (
              <p className="mt-2 text-xs">
                {account.bankName} · {account.accountNumber}
                <br />
                {account.accountName}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function GiftSettingsPanel({
  value,
  onChange,
  weddingId,
}: {
  value?: GiftSettings;
  onChange: (settings: GiftSettings) => void;
  weddingId?: string;
}) {
  const { api } = useRuntime();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const settings: GiftSettings = value ?? {
    mode: "MANUAL",
    recipients: [
      { role: "BRIDE", enabled: false },
      { role: "GROOM", enabled: false },
    ],
  };
  const accounts = useQuery({
    queryKey: ["studio-gift-accounts", weddingId],
    queryFn: ({ signal }) => getGiftAccounts(api, weddingId ?? "", signal),
    enabled: !!weddingId && settings.mode === "LINKED",
  });
  const banks = useQuery({
    queryKey: ["gift-banks", weddingId],
    queryFn: ({ signal }) => getGiftBanks(api, weddingId ?? "", signal),
    enabled: !!weddingId && settings.mode !== "LINKED",
  });
  function patch(role: "BRIDE" | "GROOM", change: Partial<GiftSettings["recipients"][number]>) {
    const rows = (["BRIDE", "GROOM"] as const).map(
      (role) => settings.recipients.find((r) => r.role === role) ?? { role, enabled: false },
    );
    onChange({
      ...settings,
      recipients: rows.map((r) => (r.role === role ? { ...r, ...change } : r)),
    });
  }
  async function connect() {
    if (!weddingId) return;
    setBusy(true);
    setError("");
    try {
      setLink((await linkGiftBankHub(api, weddingId)).hostedLinkUrl);
    } catch {
      setError("Chưa mở được liên kết ngân hàng. Kiểm tra cấu hình hệ thống và thử lại.");
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    if (!weddingId) return;
    setBusy(true);
    setError("");
    try {
      await syncGiftBankHub(api, weddingId);
      await accounts.refetch();
    } catch {
      setError("Chưa đồng bộ được tài khoản. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel} aria-label="Cấu hình hộp quà mừng">
      <h3 className="sr-only">Cấu hình hộp quà mừng</h3>
      <label className={styles.modeLabel}>
        Cách nhận mừng
        <select
          className={styles.modeSelect}
          aria-label="Cách nhận mừng"
          value={settings.mode}
          disabled={busy}
          onChange={(e) => {
            setError("");
            onChange({
              mode: e.target.value as GiftSettings["mode"],
              recipients: settings.recipients.map((r) => ({ role: r.role, enabled: r.enabled })),
            });
          }}
        >
          <option value="MANUAL">Nhập ngân hàng và STK</option>
          {settings.mode === "UPLOADED" && (
            <option value="UPLOADED" disabled>
              QR đã tải trước đây
            </option>
          )}
          <option value="LINKED">Liên kết ngân hàng</option>
        </select>
      </label>
      <p className={styles.help}>
        {settings.mode === "LINKED"
          ? "Tự ghi nhận giao dịch từ tài khoản đã liên kết."
          : "Khách quét mã để gửi mừng cưới trực tiếp."}
      </p>
      {settings.mode === "LINKED" && (
        <div className="space-y-2">
          <p>
            Chọn tài khoản đã liên kết cho từng người. Mã định danh khách được tạo khi khách mở
            thiệp.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || !weddingId}
              onClick={() => void connect()}
            >
              Liên kết ngân hàng
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !weddingId}
              onClick={() => void refresh()}
            >
              Đồng bộ tài khoản
            </Button>
          </div>
          {accounts.isError && (
            <p role="alert">
              Không tải được tài khoản.{" "}
              <button type="button" onClick={() => void accounts.refetch()}>
                Thử lại
              </button>
            </p>
          )}
        </div>
      )}
      {(["BRIDE", "GROOM"] as const).map((role) => {
        const recipient = settings.recipients.find((r) => r.role === role);
        const label = role === "BRIDE" ? "Cô dâu" : "Chú rể";
        return (
          <fieldset key={role} disabled={busy} className={styles.recipient}>
            <label className={styles.toggleRow}>
              <span className={styles.toggleCopy}>
                <strong>Hiện QR {label.toLowerCase()}</strong>
                <small>Hiển thị trong hộp quà</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label={`Hiện QR ${label.toLowerCase()}`}
                className={styles.toggleInput}
                checked={recipient?.enabled ?? false}
                onChange={(e) => patch(role, { enabled: e.target.checked })}
              />
            </label>
            {recipient?.enabled &&
              (settings.mode !== "LINKED" ? (
                <div className={`${styles.fields} space-y-3`}>
                  {settings.mode === "UPLOADED" && (
                    <p>Đã bỏ tải ảnh QR. Chọn nhập tài khoản để thiết lập lại mã QR của bạn.</p>
                  )}
                  <label className="grid gap-1">
                    Ngân hàng {label.toLowerCase()}
                    <span className={styles.controlWrap}>
                      <Wallet className={styles.controlIcon} size={16} aria-hidden="true" />
                      <select
                        className={styles.bankSelect}
                        aria-label={`Ngân hàng ${label.toLowerCase()}`}
                        value={recipient.bankBin ?? ""}
                        onChange={(e) =>
                          onChange({
                            mode: "MANUAL",
                            recipients: settings.recipients.map((r) => ({
                              role: r.role,
                              enabled: r.enabled,
                              bankBin: r.role === role ? e.target.value : r.bankBin,
                              accountNumber: r.accountNumber,
                            })),
                          })
                        }
                      >
                        <option value="">
                          {banks.isPending ? "Đang tải ngân hàng…" : "Chọn ngân hàng"}
                        </option>
                        {banks.data?.map((bank) => (
                          <option key={bank.bin} value={bank.bin}>
                            {bank.name}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                  {banks.isError && (
                    <p role="alert">
                      Không tải được ngân hàng.{" "}
                      <button type="button" onClick={() => void banks.refetch()}>
                        Thử lại
                      </button>
                    </p>
                  )}
                  <label className="grid gap-1">
                    Số tài khoản {label.toLowerCase()}
                    <span className={styles.controlWrap}>
                      <Hash className={styles.controlIcon} size={16} aria-hidden="true" />
                      <input
                        className={styles.accountInput}
                        aria-label={`Số tài khoản ${label.toLowerCase()}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={30}
                        placeholder="Nhập số tài khoản"
                        value={recipient.accountNumber ?? ""}
                        onChange={(e) =>
                          patch(role, { accountNumber: e.target.value.replace(/[^0-9]/g, "") })
                        }
                      />
                    </span>
                  </label>
                  <p>
                    InviteMe tạo QR từ thông tin bạn nhập. Bạn tự kiểm tra tiền nhận; không tự xác
                    nhận giao dịch.
                  </p>
                </div>
              ) : (
                <label className="grid gap-1">
                  Tài khoản {label.toLowerCase()}
                  <select
                    aria-label={`Tài khoản ${label.toLowerCase()}`}
                    value={recipient.accountId ?? ""}
                    onChange={(e) => patch(role, { accountId: e.target.value || undefined })}
                  >
                    <option value="">Chọn tài khoản đã liên kết</option>
                    {accounts.data
                      ?.filter((a) => a.bankHubLinked)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.bankName} · {a.accountNumber} · {a.accountName}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
          </fieldset>
        );
      })}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={styles.previewButton}
        disabled={busy}
        onClick={() => setPreview(true)}
      >
        <Eye size={16} aria-hidden="true" /> Xem thử hộp quà
      </Button>
      <Modal open={preview} onClose={() => setPreview(false)} title="Hộp quà mừng">
        <GiftCardsPreview settings={settings} accounts={accounts.data} banks={banks.data} />
        {settings.mode === "LINKED" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Bản xem thử chưa tạo mã định danh khách hoặc ghi nhận giao dịch.
          </p>
        )}
      </Modal>
      <BankHubLinkDialog
        url={link}
        mode="link"
        onClose={() => {
          setLink(null);
          void refresh();
        }}
        onFinished={() => {
          setLink(null);
          void refresh();
        }}
      />
    </section>
  );
}

export function GiftPreviewPanel({
  settings,
  weddingId,
}: {
  settings?: GiftSettings;
  weddingId?: string;
}) {
  const { api } = useRuntime();
  const accounts = useQuery({
    queryKey: ["studio-gift-accounts", weddingId],
    queryFn: ({ signal }) => getGiftAccounts(api, weddingId ?? "", signal),
    enabled: !!weddingId && settings?.mode === "LINKED",
  });
  const banks = useQuery({
    queryKey: ["gift-banks", weddingId],
    queryFn: ({ signal }) => getGiftBanks(api, weddingId ?? "", signal),
    enabled: !!weddingId && settings?.mode === "MANUAL",
  });
  return <GiftCardsPreview settings={settings} accounts={accounts.data} banks={banks.data} />;
}
