"use client";
/* eslint-disable @next/next/no-img-element -- QR images must retain their original pixels. */

import { resolveMediaUrl } from "@/core/config/media-url";
import { Eye, Landmark, CheckCircle2, Info, ExternalLink, Settings } from "lucide-react";
import styles from "./gift-settings-panel.module.css";
import { useState, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { getGiftAccounts, getGiftBanks, type GiftBankAccount } from "../api/gifts.api";
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
          accounts.find((a) => a.id === r.accountId) ??
          (settings?.mode === "MANUAL" && validManualGiftRecipient(r)
            ? {
                bankBin: r.bankBin ?? "",
                accountNumber: r.accountNumber ?? "",
                accountName: r.accountName ?? "",
                bankName: banks.find((b) => b.bin === r.bankBin)?.name ?? r.bankBin,
              }
            : undefined);
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
  const [preview, setPreview] = useState(false);
  const formId = useId();

  const settings: GiftSettings = value ?? {
    mode: "LINKED",
    recipients: [
      { role: "BRIDE", enabled: false },
      { role: "GROOM", enabled: false },
    ],
  };

  const accounts = useQuery({
    queryKey: ["studio-gift-accounts", weddingId],
    queryFn: ({ signal }) => getGiftAccounts(api, weddingId ?? "", signal),
    enabled: !!weddingId,
  });

  const [accountTypes, setAccountTypes] = useState<
    Record<"BRIDE" | "GROOM", "LINKED" | "UNLINKED">
  >({
    BRIDE: "LINKED",
    GROOM: "LINKED",
  });

  function patch(role: "BRIDE" | "GROOM", change: Partial<GiftSettings["recipients"][number]>) {
    const rows = (["BRIDE", "GROOM"] as const).map(
      (rRole) =>
        settings.recipients.find((r) => r.role === rRole) ?? { role: rRole, enabled: false },
    );
    onChange({
      mode: "LINKED",
      recipients: rows.map((r) => (r.role === role ? { ...r, ...change } : r)),
    });
  }

  function handleSelectType(role: "BRIDE" | "GROOM", type: "LINKED" | "UNLINKED") {
    setAccountTypes((prev) => ({ ...prev, [role]: type }));
    const available = (accounts.data ?? []).filter((a) =>
      type === "LINKED" ? a.bankHubLinked : !a.bankHubLinked,
    );

    // Pick best match by role or first available
    const match =
      available.find((a) => {
        const text = (a.label ?? "").toLowerCase();
        return role === "BRIDE"
          ? text.includes("gái") || text.includes("dâu") || text === "bride"
          : text.includes("trai") || text.includes("rể") || text === "groom";
      }) ?? available[0];

    patch(role, { accountId: match?.id });
  }

  const giftManagementUrl = weddingId ? `/weddings/${weddingId}/gifts` : "#";

  return (
    <section className={styles.panel} aria-label="Cấu hình hộp quà cưới">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base" role="img" aria-label="Hộp quà">
            🎁
          </span>
          <h3 className="text-sm font-semibold text-stone-900">Hộp quà cưới</h3>
        </div>
        <p className="mt-1 text-xs text-stone-500">
          Chọn tài khoản nhận tiền mừng hiển thị trên thiệp.
        </p>
      </div>

      {/* Recipients */}
      {(["BRIDE", "GROOM"] as const).map((role) => {
        const recipient = settings.recipients.find((r) => r.role === role);
        const label = role === "BRIDE" ? "Cô dâu" : "Chú rể";
        const selectedAccount = accounts.data?.find((a) => a.id === recipient?.accountId);

        const currentType = selectedAccount
          ? selectedAccount.bankHubLinked
            ? "LINKED"
            : "UNLINKED"
          : (accountTypes[role] ?? "LINKED");

        const availableAccounts = (accounts.data ?? []).filter((a) =>
          currentType === "LINKED" ? a.bankHubLinked : !a.bankHubLinked,
        );

        const activeAccount =
          selectedAccount &&
          (currentType === "LINKED"
            ? selectedAccount.bankHubLinked
            : !selectedAccount.bankHubLinked)
            ? selectedAccount
            : (availableAccounts.find((a) => {
                const text = (a.label ?? "").toLowerCase();
                return role === "BRIDE"
                  ? text.includes("gái") || text.includes("dâu") || text === "bride"
                  : text.includes("trai") || text.includes("rể") || text === "groom";
              }) ?? availableAccounts[0]);

        return (
          <fieldset key={role} className={styles.recipient}>
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
                onChange={(e) => {
                  const enabled = e.target.checked;
                  if (enabled && !recipient?.accountId && activeAccount) {
                    patch(role, { enabled, accountId: activeAccount.id });
                  } else {
                    patch(role, { enabled });
                  }
                }}
              />
            </label>

            {recipient?.enabled && (
              <div className="space-y-3 pb-3">
                <p className="text-xs font-medium text-stone-700">Tài khoản nhận tiền</p>

                {/* Radio selection */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
                    <input
                      type="radio"
                      name={`${formId}-account-type-${role}`}
                      value="LINKED"
                      checked={currentType === "LINKED"}
                      onChange={() => handleSelectType(role, "LINKED")}
                      className="h-4 w-4 accent-[#d87587]"
                    />
                    <span>Tài khoản liên kết</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
                    <input
                      type="radio"
                      name={`${formId}-account-type-${role}`}
                      value="UNLINKED"
                      checked={currentType === "UNLINKED"}
                      onChange={() => handleSelectType(role, "UNLINKED")}
                      className="h-4 w-4 accent-[#d87587]"
                    />
                    <span>Tài khoản không liên kết</span>
                  </label>
                </div>

                {/* Account card or Empty alert */}
                {activeAccount ? (
                  <div className="space-y-1.5">
                    {availableAccounts.length > 1 && (
                      <select
                        aria-label={`Chọn tài khoản ${label.toLowerCase()}`}
                        className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-800"
                        value={recipient?.accountId ?? activeAccount.id}
                        onChange={(e) => patch(role, { accountId: e.target.value || undefined })}
                      >
                        {availableAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.bankName} - {a.accountName} (•••• {a.accountNumber.slice(-4)})
                          </option>
                        ))}
                      </select>
                    )}

                    <div className="rounded-xl border border-stone-200/90 bg-[#f9f7f5] p-3 text-stone-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold text-xs text-stone-900">
                          <Landmark size={15} className="text-stone-500" />
                          <span>{activeAccount.bankName}</span>
                        </div>
                        {activeAccount.bankHubLinked && (
                          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                        )}
                      </div>
                      <p className="mt-1.5 text-xs text-stone-700 font-medium tracking-wide">
                        {activeAccount.accountName} • ••••{" "}
                        {activeAccount.accountNumber.slice(-4) || activeAccount.accountNumber}
                      </p>
                      <p className="mt-1 text-[11px] text-stone-500">
                        {activeAccount.bankHubLinked
                          ? "Tự động ghi nhận giao dịch"
                          : "Nhận chuyển khoản, đối soát thủ công"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200/80 bg-[#fdfaf3] p-3 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-stone-800">
                      <Info size={14} className="text-amber-600 shrink-0" />
                      <span>Chưa thiết lập tài khoản</span>
                    </div>
                    <p className="mt-1 text-stone-600 text-[11px] leading-relaxed">
                      Bạn cần thiết lập tài khoản nhận tiền mừng của {label.toLowerCase()} trước khi
                      hiển thị mã QR trên thiệp.
                    </p>
                    <a
                      href={giftManagementUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#c05870] hover:underline"
                    >
                      Thiết lập tài khoản
                      <ExternalLink size={11} />
                    </a>
                  </div>
                )}
              </div>
            )}
          </fieldset>
        );
      })}

      {/* Footer Navigation & Preview */}
      <div className="border-t border-stone-200 pt-3 pb-3">
        <a
          href={giftManagementUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-stone-600 hover:text-[#c05870] hover:underline"
        >
          <Settings size={14} />
          <span>Quản lý tài khoản nhận mừng</span>
          <ExternalLink size={11} />
        </a>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className={styles.previewButton}
        onClick={() => setPreview(true)}
      >
        <Eye size={16} aria-hidden="true" /> Xem thử hộp quà
      </Button>

      <Modal open={preview} onClose={() => setPreview(false)} title="Hộp quà mừng">
        <GiftCardsPreview settings={settings} accounts={accounts.data} />
      </Modal>
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
    enabled: !!weddingId,
  });
  const banks = useQuery({
    queryKey: ["gift-banks", weddingId],
    queryFn: ({ signal }) => getGiftBanks(api, weddingId ?? "", signal),
    enabled: !!weddingId && settings?.mode === "MANUAL",
  });
  return <GiftCardsPreview settings={settings} accounts={accounts.data} banks={banks.data} />;
}
