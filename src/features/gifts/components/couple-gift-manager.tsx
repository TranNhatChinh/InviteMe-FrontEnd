"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Link2, Plus, QrCode, Send, User } from "lucide-react";
import { decodeVietQrImage } from "../utils/parse-vietqr";
import { useRuntime } from "@/core/config/runtime";
import { usePermission } from "@/shared/components/permission-guard";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { ApiError } from "@/core/api/api-error";
import { BankHubLinkDialog } from "./bank-hub-link-dialog";
import {
  addGiftAccount,
  confirmGift,
  getGiftAccounts,
  getGiftBanks,
  getGiftLedger,
  getGiftSummary,
  linkGiftBankHub,
  recordGift,
  removeGiftAccount,
  syncGiftBankHub,
  unlinkGiftBankHub,
  setGiftAccountDisplay,
  type GiftBankAccount,
} from "../api/gifts.api";
import { useLocale } from "@/i18n/language-context";
import { formatCurrency, formatDate, formatNumber } from "@/i18n/format";
// eslint-disable-next-line architecture/boundaries -- Gift management renders the wedding plan's QR entitlement notice beside its existing ledger.
import { FeatureLimitNotice, planEntitlementState, useWeddingPlan } from "@/features/plans";

type GiftManagerTab = "overview" | "transactions" | "accounts";
type Role = "BRIDE" | "GROOM";

function matchRole(account: GiftBankAccount): Role | null {
  const text = (account.label ?? "").toLowerCase();
  if (text.includes("gái") || text.includes("dâu") || text === "bride") return "BRIDE";
  if (text.includes("trai") || text.includes("rể") || text === "groom") return "GROOM";
  return null;
}

function maskAccountNumber(accountNumber: string) {
  const clean = accountNumber.trim();
  if (clean.length <= 4) return clean;
  return `•••• ${clean.slice(-4)}`;
}

export function CoupleGiftManager({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("gifts");
  const { t: tPlans } = useTranslation("plans");
  const { language } = useLocale();
  const { api } = useRuntime();
  const queryClient = useQueryClient();
  const { can, isWeddingWide, isOwner } = usePermission();
  const editable = can("GIFT_EDIT") && isWeddingWide("GIFT_EDIT");
  const weddingPlan = useWeddingPlan(weddingId, can("GIFT_VIEW"));
  const giftQrGate =
    weddingPlan.data && !weddingPlan.isError
      ? planEntitlementState(weddingPlan.data, "giftQr")
      : null;

  const [activeTab, setActiveTab] = useState<GiftManagerTab>("overview");
  const [sideFilter, setSideFilter] = useState<"ALL" | "GROOM" | "BRIDE">("ALL");
  const [pageNumber, setPageNumber] = useState(1);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hub, setHub] = useState<{
    url: string;
    mode: "link" | "unlink";
    accountId: string | null;
  } | null>(null);

  // Modal states for Tài khoản nhận mừng
  const [unlinkedModalRole, setUnlinkedModalRole] = useState<Role | null>(null);
  const [editingUnlinkedAccount, setEditingUnlinkedAccount] = useState<GiftBankAccount | null>(
    null,
  );
  const [bankBin, setBankBin] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [managingLinked, setManagingLinked] = useState<{
    role: Role;
    account: GiftBankAccount;
  } | null>(null);

  // Modal state for Chuyển tiền (call real POST /api/webhooks/sepay-bankhub)
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferAccountId, setTransferAccountId] = useState("");
  const [transferContent, setTransferContent] = useState("");
  const [transferAmount, setTransferAmount] = useState("500000");
  const [qrScanStatus, setQrScanStatus] = useState<{ ok: boolean; text: string } | null>(null);

  // Modal state for Ghi nhận thủ công
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordMethod, setRecordMethod] = useState<"CASH" | "TRANSFER">("CASH");
  const [recordGiverName, setRecordGiverName] = useState("");
  const [recordAmount, setRecordAmount] = useState("");

  async function handleQrFile(file: File | Blob) {
    try {
      const parsed = await decodeVietQrImage(file);
      const matched = (accounts.data ?? []).find(
        (acc) =>
          parsed.accountNumber &&
          acc.accountNumber === parsed.accountNumber &&
          (!parsed.bankBin || acc.bankBin === parsed.bankBin),
      );
      if (matched) setTransferAccountId(matched.id);
      if (parsed.content) setTransferContent(parsed.content);
      if (parsed.amount) setTransferAmount(parsed.amount);
      setQrScanStatus({
        ok: true,
        text: `Đã đọc QR${matched ? ` · ${matched.bankName} ${matched.accountNumber}` : ""}${
          parsed.content ? ` · Nội dung: ${parsed.content}` : ""
        }${parsed.amount ? ` · ${parsed.amount}đ` : ""}`,
      });
    } catch (err) {
      setQrScanStatus({
        ok: false,
        text: err instanceof Error ? err.message : "Không đọc được mã QR từ ảnh.",
      });
    }
  }

  const accounts = useQuery({
    queryKey: ["gift-accounts", weddingId],
    queryFn: ({ signal }) => getGiftAccounts(api, weddingId, signal),
  });
  const banks = useQuery({
    queryKey: ["gift-banks", weddingId],
    queryFn: ({ signal }) => getGiftBanks(api, weddingId, signal),
  });
  const summary = useQuery({
    queryKey: ["gift-summary", weddingId],
    queryFn: ({ signal }) => getGiftSummary(api, weddingId, signal),
  });
  const overviewLedger = useQuery({
    queryKey: ["gift-ledger-overview", weddingId],
    queryFn: ({ signal }) => getGiftLedger(api, weddingId, 1, "", signal, 100),
  });
  const ledger = useQuery({
    queryKey: ["gift-ledger", weddingId, pageNumber, search],
    queryFn: ({ signal }) => getGiftLedger(api, weddingId, pageNumber, search, signal, 25),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["gift-accounts", weddingId] }),
      queryClient.invalidateQueries({ queryKey: ["gift-summary", weddingId] }),
      queryClient.invalidateQueries({ queryKey: ["gift-ledger-overview", weddingId] }),
      queryClient.invalidateQueries({ queryKey: ["gift-ledger", weddingId] }),
    ]);
  };

  const saveUnlinked = useMutation({
    mutationFn: async () => {
      if (!unlinkedModalRole) return;
      const roleLabel = unlinkedModalRole === "BRIDE" ? t("bride") : t("groom");
      if (editingUnlinkedAccount) {
        await removeGiftAccount(api, weddingId, editingUnlinkedAccount.id);
      }
      await addGiftAccount(api, weddingId, {
        bankBin,
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
        label: roleLabel,
      });
    },
    onSuccess: async () => {
      setError("");
      setUnlinkedModalRole(null);
      setEditingUnlinkedAccount(null);
      setBankBin("");
      setAccountNumber("");
      setAccountName("");
      await refresh();
    },
    onError: () => setError(t("addAccountFailed")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeGiftAccount(api, weddingId, id),
    onSuccess: async () => {
      setError("");
      setUnlinkedModalRole(null);
      setEditingUnlinkedAccount(null);
      setManagingLinked(null);
      await refresh();
    },
    onError: () => setError(t("deleteAccountFailed")),
  });

  const display = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      showInInvitation: boolean;
      label?: string | null;
    }) => setGiftAccountDisplay(api, weddingId, id, body),
    onSuccess: async () => {
      setError("");
      await refresh();
    },
    onError: () => setError(t("displaySaveFailed")),
  });

  const bankHubError = (cause: unknown) =>
    setError(
      cause instanceof ApiError && cause.backendCode === "BANK_HUB_NOT_CONFIGURED"
        ? t("bankHub.notConfigured")
        : t("bankHub.failed"),
    );

  const openHub = useMutation({
    mutationFn: async (accountId: string | null) => {
      const link = accountId
        ? await unlinkGiftBankHub(api, weddingId, accountId)
        : await linkGiftBankHub(api, weddingId);
      return {
        url: link.hostedLinkUrl,
        mode: accountId ? ("unlink" as const) : ("link" as const),
        accountId,
      };
    },
    onSuccess: (opened) => {
      setError("");
      setNotice("");
      setManagingLinked(null);
      setHub(opened);
    },
    onError: bankHubError,
  });

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSyncedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const sync = useMutation({
    mutationFn: async (opts?: {
      silent?: boolean;
      previousLinkedCount?: number;
      attempt?: number;
    }) => {
      const result = await syncGiftBankHub(api, weddingId);
      return { result, opts };
    },
    onSuccess: async ({ result, opts }) => {
      const linkedCount = result.accounts.filter((a) => a.bankHubLinked).length;
      const attempt = opts?.attempt ?? 0;
      const unchanged =
        opts?.previousLinkedCount !== undefined && linkedCount === opts.previousLinkedCount;

      if (unchanged && attempt < 2) {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          sync.mutate({ ...opts, attempt: attempt + 1 });
        }, 1500);
        return;
      }

      if (!opts?.silent) {
        setNotice(
          result.notAdded.length > 0
            ? t("bankHub.notAdded", { accounts: result.notAdded.join(", ") })
            : t("bankHub.synced", { count: linkedCount }),
        );
      }
      await refresh();
    },
    onError: (cause, opts) => {
      if (!opts?.silent) bankHubError(cause);
    },
  });

  // Auto-sync once when opening the accounts tab in case a prior SePay link completed slightly late
  useEffect(() => {
    if (activeTab !== "accounts" || !editable || autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    sync.mutate({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, editable]);

  const syncMutate = sync.mutate;
  const linkedCountNow = (accounts.data ?? []).filter((a) => a.bankHubLinked).length;
  const closeHub = useCallback(() => {
    setHub(null);
    syncMutate({ previousLinkedCount: linkedCountNow, attempt: 0 });
  }, [syncMutate, linkedCountNow]);

  const confirm = useMutation({
    mutationFn: (id: string) => confirmGift(api, weddingId, id),
    onSuccess: refresh,
    onError: () => setError(t("confirmGiftFailed")),
  });

  const sendWebhookTransfer = useMutation({
    mutationFn: async () => {
      const targetAccount = (accounts.data ?? []).find((a) => a.id === transferAccountId);
      if (!targetAccount) {
        throw new Error("Vui lòng chọn tài khoản nhận.");
      }
      const amount = Number(transferAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Số tiền không hợp lệ.");
      }
      const apiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5043").replace(
        /\/api\/?$/,
        "",
      );
      const notifyApiKey =
        process.env.NEXT_PUBLIC_SEPAY_NOTIFY_API_KEY ?? "Inv1teMeBankHub2026xK9pQ7mZ3wR5tY";
      const response = await fetch(`${apiOrigin}/api/webhooks/sepay-bankhub`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Apikey ${notifyApiKey}`,
        },
        body: JSON.stringify({
          gateway: targetAccount.bankName,
          transaction_date: new Date().toISOString(),
          account_number: targetAccount.accountNumber,
          bank_account_xid: targetAccount.id,
          content: transferContent.trim(),
          transfer_type: "credit",
          amount,
          reference_code: `SP${Date.now()}`,
          transaction_id:
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }),
      });
      if (!response.ok) {
        throw new Error(`Webhook trả về HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: async () => {
      setError("");
      setNotice("Webhook SePay BankHub đã xử lý giao dịch và cập nhật số tiền.");
      setTransferOpen(false);
      setTransferContent("");
      await refresh();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Gọi webhook thất bại.");
    },
  });

  const recordManual = useMutation({
    mutationFn: async () => {
      const amount = Number(recordAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Số tiền không hợp lệ.");
      }
      const key =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return recordGift(
        api,
        weddingId,
        {
          method: recordMethod,
          giverName: recordGiverName.trim(),
          amount,
        },
        key,
        false,
      );
    },
    onSuccess: async () => {
      setError("");
      setNotice("Đã ghi nhận tiền mừng thủ công.");
      setRecordOpen(false);
      setRecordGiverName("");
      setRecordAmount("");
      await refresh();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Không ghi nhận được tiền mừng.");
    },
  });

  // Map accounts into BRIDE / GROOM slots for both linked and unlinked
  const roleAccounts = useMemo(() => {
    const list = accounts.data ?? [];
    const result: Record<Role, { linked?: GiftBankAccount; unlinked?: GiftBankAccount }> = {
      BRIDE: {},
      GROOM: {},
    };
    const unassignedLinked: GiftBankAccount[] = [];
    const unassignedUnlinked: GiftBankAccount[] = [];

    for (const acc of list) {
      const role = matchRole(acc);
      if (role) {
        if (acc.bankHubLinked && !result[role].linked) result[role].linked = acc;
        else if (!acc.bankHubLinked && !result[role].unlinked) result[role].unlinked = acc;
        else if (acc.bankHubLinked) unassignedLinked.push(acc);
        else unassignedUnlinked.push(acc);
      } else if (acc.bankHubLinked) {
        unassignedLinked.push(acc);
      } else {
        unassignedUnlinked.push(acc);
      }
    }

    for (const acc of unassignedLinked) {
      if (!result.BRIDE.linked) result.BRIDE.linked = acc;
      else if (!result.GROOM.linked) result.GROOM.linked = acc;
    }
    for (const acc of unassignedUnlinked) {
      if (!result.BRIDE.unlinked) result.BRIDE.unlinked = acc;
      else if (!result.GROOM.unlinked) result.GROOM.unlinked = acc;
    }

    return result;
  }, [accounts.data]);

  const incomingTransactions = useMemo(
    () =>
      (overviewLedger.data?.items ?? []).filter(
        (gift) => gift.status === "PAID" || (gift.amountReceived ?? 0) > 0,
      ),
    [overviewLedger.data?.items],
  );

  const filteredLedgerItems = useMemo(() => {
    const items = ledger.data?.items ?? [];
    if (sideFilter === "ALL") return items;
    const ids = new Set(
      [roleAccounts[sideFilter].linked?.id, roleAccounts[sideFilter].unlinked?.id].filter(
        (id): id is string => !!id,
      ),
    );
    return items.filter((gift) => gift.accountId !== null && ids.has(gift.accountId));
  }, [ledger.data?.items, roleAccounts, sideFilter]);

  function openUnlinkedModal(role: Role, existing?: GiftBankAccount) {
    setError("");
    setUnlinkedModalRole(role);
    setEditingUnlinkedAccount(existing ?? null);
    setBankBin(existing?.bankBin ?? "");
    setAccountNumber(existing?.accountNumber ?? "");
    setAccountName(existing?.accountName ?? "");
  }

  const data = summary.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Quản lý tiền mừng</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("ledgerDescription")}</p>
        </div>
        {editable && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setError("");
              setQrScanStatus(null);
              setTransferAccountId("");
              setTransferOpen(true);
            }}
          >
            <Send size={15} className="mr-1.5" />
            Chuyển tiền
          </Button>
        )}
      </header>

      {/* Tabs navigation */}
      <nav
        aria-label="Quản lý tiền mừng"
        className="flex gap-6 border-b border-border text-sm font-medium"
      >
        {(
          [
            { key: "overview", label: "Tổng quan" },
            { key: "transactions", label: "Giao dịch" },
            { key: "accounts", label: "Tài khoản nhận mừng" },
          ] as const
        ).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`-mb-px border-b-2 pb-2.5 transition-colors ${
                active
                  ? "border-[#c05870] text-[#c05870]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {weddingPlan.isError && (
        <FeatureLimitNotice
          status="unavailable"
          title={tPlans("gate.unknownTitle")}
          description={tPlans("gate.unknownDescription")}
          retryLabel={tPlans("gate.retry")}
          onRetry={() => void weddingPlan.refetch()}
        />
      )}
      {giftQrGate?.locked && weddingPlan.data && !weddingPlan.isError && (
        <FeatureLimitNotice
          title={tPlans("gate.notIncludedTitle", {
            feature: tPlans("gate.features.giftQr"),
          })}
          description={
            isOwner
              ? t("plan.giftQrOwnerDescription", { planName: weddingPlan.data.planName })
              : t("plan.giftQrContactOwner", { planName: weddingPlan.data.planName })
          }
          variant="compact"
          upgradeHref={isOwner ? `/weddings/${encodeURIComponent(weddingId)}/plan` : undefined}
          upgradeLabel={isOwner ? tPlans("gate.viewPlans") : undefined}
        />
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"
        >
          {notice}
        </p>
      )}

      {/* TAB 1: TỔNG QUAN */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {summary.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("loadSummaryFailed")}
            </p>
          )}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [t("received"), data?.totalReceived],
              [t("receivedCount"), data?.receivedCount],
              [t("waiting"), data?.waiting],
              [t("needsReview"), data?.needsReview],
            ].map(([title, value]) => (
              <article key={String(title)} className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">{title}</p>
                <p className="mt-1 text-2xl font-semibold">
                  {typeof value === "number" && title === t("received")
                    ? formatCurrency(value, language)
                    : typeof value === "number"
                      ? formatNumber(value, language)
                      : (value ?? "—")}
                </p>
              </article>
            ))}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Giao dịch tiền vào</h2>
                <p className="text-sm text-muted-foreground">
                  Toàn bộ các giao dịch tiền mừng đã ghi nhận vào tài khoản.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("transactions")}
              >
                Xem tất cả giao dịch
              </Button>
            </div>

            {overviewLedger.isPending ? (
              <p role="status">{t("loadingLedger")}</p>
            ) : overviewLedger.isError ? (
              <p role="alert" className="text-destructive">
                {t("loadGiftsFailed")}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-muted">
                    <tr>
                      {[
                        t("sender"),
                        t("method"),
                        t("status"),
                        t("amount"),
                        t("wish"),
                        t("time"),
                      ].map((heading) => (
                        <th key={heading} className="px-3 py-2 font-medium">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {incomingTransactions.map((gift) => (
                      <tr key={gift.id} className="border-t">
                        <td className="px-3 py-3 font-medium">{gift.giverName}</td>
                        <td className="px-3 py-3">{gift.method}</td>
                        <td className="px-3 py-3">
                          <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            {gift.status === "PAID" ? t("paid") : gift.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-medium">
                          {formatCurrency(
                            gift.amountReceived ?? gift.amountExpected ?? 0,
                            language,
                          )}
                          {gift.amountMismatch && (
                            <span className="ml-1 text-amber-700">{t("mismatch")}</span>
                          )}
                        </td>
                        <td className="max-w-56 truncate px-3 py-3">{gift.message || "—"}</td>
                        <td className="px-3 py-3">
                          {formatDate(gift.paidAt || gift.createdAt, language, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </td>
                      </tr>
                    ))}
                    {incomingTransactions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                          Chưa có giao dịch tiền vào.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: GIAO DỊCH */}
      {activeTab === "transactions" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Giao dịch quà mừng</h2>
              <p className="text-sm text-muted-foreground">Theo dõi và đối soát tiền mừng cưới.</p>
            </div>
            {editable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setError("");
                  setRecordOpen(true);
                }}
              >
                <Plus size={15} className="mr-1" />
                Ghi nhận
              </Button>
            )}
          </div>

          <div className="flex gap-5 border-b border-border text-sm font-medium">
            {(
              [
                { key: "ALL", label: "Tất cả" },
                { key: "GROOM", label: "Chú rể" },
                { key: "BRIDE", label: "Cô dâu" },
              ] as const
            ).map((item) => {
              const active = sideFilter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setSideFilter(item.key);
                    setPageNumber(1);
                  }}
                  className={`-mb-px border-b-2 pb-2 transition-colors ${
                    active
                      ? "border-[#c05870] text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <input
            aria-label={t("searchTransaction")}
            className="w-full rounded-full border bg-background px-4 py-2 text-sm"
            placeholder="Tìm tên người gửi, khách mời hoặc mã giao dịch..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPageNumber(1);
            }}
          />
          {ledger.isPending ? (
            <p role="status">{t("loadingLedger")}</p>
          ) : ledger.isError ? (
            <p role="alert" className="text-destructive">
              {t("loadGiftsFailed")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-muted">
                  <tr>
                    {[
                      t("sender"),
                      t("method"),
                      t("status"),
                      t("amount"),
                      t("wish"),
                      t("time"),
                      "",
                    ].map((x) => (
                      <th key={x} className="px-3 py-2 font-medium">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLedgerItems.map((gift) => (
                    <tr key={gift.id} className="border-t">
                      <td className="px-3 py-3">{gift.giverName}</td>
                      <td className="px-3 py-3">{gift.method}</td>
                      <td className="px-3 py-3">
                        {gift.status === "PAID"
                          ? t("paid")
                          : gift.status === "CLAIMED"
                            ? t("transferClaimed")
                            : gift.status === "PENDING"
                              ? t("waitingTransfer")
                              : gift.status}
                      </td>
                      <td className="px-3 py-3">
                        {formatCurrency(gift.amountReceived ?? gift.amountExpected ?? 0, language)}
                        {gift.amountMismatch && (
                          <span className="ml-1 text-amber-700">{t("mismatch")}</span>
                        )}
                      </td>
                      <td className="max-w-56 truncate px-3 py-3">{gift.message || "—"}</td>
                      <td className="px-3 py-3">
                        {formatDate(gift.paidAt || gift.createdAt, language, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-3 py-3">
                        {editable && ["PENDING", "CLAIMED"].includes(gift.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={confirm.isPending}
                            onClick={() => confirm.mutate(gift.id)}
                          >
                            {t("confirmReceived")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredLedgerItems.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                        {t("noTransactions")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {ledger.data && (
            <div className="flex items-center justify-between text-sm">
              <span>
                {t("transactionCount", { count: formatNumber(ledger.data.totalCount, language) })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageNumber <= 1}
                  onClick={() => setPageNumber((n) => n - 1)}
                >
                  {t("previous")}
                </Button>
                <span className="px-2 py-2">
                  {t("page", { page: formatNumber(pageNumber, language) })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageNumber * ledger.data.pageSize >= ledger.data.totalCount}
                  onClick={() => setPageNumber((n) => n + 1)}
                >
                  {t("next")}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: TÀI KHOẢN NHẬN MỪNG */}
      {activeTab === "accounts" && (
        <section className="space-y-4">
          {(["BRIDE", "GROOM"] as const).map((role) => {
            const roleLabel = role === "BRIDE" ? t("bride") : t("groom");
            const linked = roleAccounts[role].linked;
            const unlinked = roleAccounts[role].unlinked;

            return (
              <article key={role} className="rounded-xl border bg-card p-5">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <User size={16} className="text-[#c05870]" />
                  <span>{roleLabel}</span>
                </div>

                <div className="divide-y divide-border">
                  {/* Tài khoản liên kết */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">Tài khoản liên kết</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Link2 size={14} className="shrink-0" />
                        <span>
                          {linked
                            ? `${linked.bankName} · ${maskAccountNumber(linked.accountNumber)}`
                            : "Chưa liên kết tài khoản"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">Tự động đối soát giao dịch</p>
                    </div>
                    {editable && (
                      <div>
                        {linked ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setManagingLinked({ role, account: linked })}
                          >
                            Quản lý
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={openHub.isPending || sync.isPending}
                            onClick={() => openHub.mutate(null)}
                          >
                            {openHub.isPending && openHub.variables === null
                              ? t("bankHub.opening")
                              : sync.isPending
                                ? t("bankHub.syncing")
                                : "Liên kết"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tài khoản không liên kết */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        Tài khoản không liên kết
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Landmark size={14} className="shrink-0" />
                        <span>
                          {unlinked
                            ? `${unlinked.bankName} · ${maskAccountNumber(unlinked.accountNumber)}`
                            : "Chưa cấu hình"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Nhận chuyển khoản, đối soát thủ công
                      </p>
                    </div>
                    {editable && (
                      <div>
                        {unlinked ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openUnlinkedModal(role, unlinked)}
                          >
                            Chỉnh sửa
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openUnlinkedModal(role)}
                          >
                            Thiết lập
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* Modal thiết lập / chỉnh sửa tài khoản không liên kết */}
      <Modal
        open={!!unlinkedModalRole}
        onClose={() => {
          setUnlinkedModalRole(null);
          setEditingUnlinkedAccount(null);
        }}
        title={
          unlinkedModalRole
            ? `${editingUnlinkedAccount ? "Chỉnh sửa" : "Thiết lập"} tài khoản ${
                unlinkedModalRole === "BRIDE" ? "cô dâu" : "chú rể"
              }`
            : ""
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            saveUnlinked.mutate();
          }}
        >
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{t("chooseBank")}</span>
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={bankBin}
              onChange={(event) => setBankBin(event.target.value)}
              required
            >
              <option value="">{t("chooseBank")}</option>
              {banks.data?.map((bank) => (
                <option key={bank.bin} value={bank.bin}>
                  {bank.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{t("accountNumber")}</span>
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              placeholder={t("accountNumber")}
              value={accountNumber}
              onChange={(event) => setAccountNumber(event.target.value)}
              required
              maxLength={30}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{t("accountName")}</span>
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              placeholder={t("accountName")}
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              required
              maxLength={100}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            {editingUnlinkedAccount ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={remove.isPending}
                onClick={() => remove.mutate(editingUnlinkedAccount.id)}
              >
                {t("delete")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setUnlinkedModalRole(null);
                  setEditingUnlinkedAccount(null);
                }}
              >
                Hủy
              </Button>
              <Button type="submit" size="sm" disabled={saveUnlinked.isPending}>
                {saveUnlinked.isPending ? t("saving") : "Lưu tài khoản"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal quản lý tài khoản liên kết */}
      <Modal
        open={!!managingLinked}
        onClose={() => setManagingLinked(null)}
        title="Quản lý tài khoản liên kết"
      >
        {managingLinked && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
              <p className="font-medium">{managingLinked.account.bankName}</p>
              <p className="text-muted-foreground">
                {managingLinked.account.accountName} · {managingLinked.account.accountNumber}
              </p>
            </div>

            <label className="grid gap-1.5">
              <span className="font-medium">Vai trò nhận mừng</span>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={managingLinked.account.label ?? ""}
                disabled={display.isPending}
                onChange={(event) => {
                  const newLabel = event.target.value || null;
                  display.mutate({
                    id: managingLinked.account.id,
                    showInInvitation: managingLinked.account.showInInvitation,
                    label: newLabel,
                  });
                  setManagingLinked((prev) =>
                    prev ? { ...prev, account: { ...prev.account, label: newLabel } } : null,
                  );
                }}
              >
                <option value={t("bride")}>{t("bride")}</option>
                <option value={t("groom")}>{t("groom")}</option>
              </select>
            </label>

            <div className="flex flex-wrap justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={openHub.isPending || sync.isPending}
                onClick={() => openHub.mutate(managingLinked.account.id)}
              >
                {t("bankHub.unlink")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={remove.isPending}
                onClick={() => remove.mutate(managingLinked.account.id)}
              >
                {t("delete")}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <BankHubLinkDialog
        url={hub?.url ?? null}
        mode={hub?.mode ?? "link"}
        onClose={closeHub}
        onFinished={closeHub}
        onExpired={() => {
          if (hub && !openHub.isPending) {
            openHub.mutate(hub.accountId);
          }
        }}
      />

      {/* Modal chuyển tiền gọi API webhook thật /api/webhooks/sepay-bankhub */}
      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Chuyển tiền (SePay BankHub Webhook)"
      >
        <form
          className="space-y-4"
          onPaste={(event) => {
            const imageItem = Array.from(event.clipboardData.items).find((item) =>
              item.type.startsWith("image/"),
            );
            const file = imageItem?.getAsFile();
            if (file) {
              event.preventDefault();
              void handleQrFile(file);
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            sendWebhookTransfer.mutate();
          }}
        >
          {/* QR Screenshot Dropzone / Paste */}
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-center text-xs text-muted-foreground hover:border-[#c05870] hover:bg-muted/50"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) void handleQrFile(file);
            }}
          >
            <QrCode size={18} className="text-[#c05870]" />
            <span className="font-medium text-foreground">
              Dán ảnh chụp mã QR (Ctrl+V), kéo thả hoặc bấm chọn ảnh
            </span>
            <span>Tự động đọc STK, số tiền và nội dung chuyển khoản từ VietQR</span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleQrFile(file);
                event.target.value = "";
              }}
            />
          </label>
          {qrScanStatus && (
            <p
              className={`rounded-md px-3 py-2 text-xs ${
                qrScanStatus.ok
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {qrScanStatus.text}
            </p>
          )}
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Tài khoản nhận</span>
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={transferAccountId}
              onChange={(event) => setTransferAccountId(event.target.value)}
              required
            >
              <option value="">-- Chọn tài khoản nhận --</option>
              {(accounts.data ?? []).map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.bankName} · {acc.accountNumber} ({acc.label || acc.accountName})
                  {acc.bankHubLinked ? " · SePay" : ""}
                </option>
              ))}
            </select>
          </label>

          {(overviewLedger.data?.items ?? []).some(
            (g) => g.code && ["PENDING", "CLAIMED"].includes(g.status),
          ) && (
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Chọn nhanh mã khách đang chờ (tuỳ chọn)</span>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue=""
                onChange={(event) => {
                  const selected = (overviewLedger.data?.items ?? []).find(
                    (g) => g.id === event.target.value,
                  );
                  if (!selected) return;
                  if (selected.code) setTransferContent(selected.code);
                  if (selected.amountExpected) setTransferAmount(String(selected.amountExpected));
                }}
              >
                <option value="">-- Chọn giao dịch đang chờ để điền nhanh --</option>
                {(overviewLedger.data?.items ?? [])
                  .filter((g) => g.code && ["PENDING", "CLAIMED"].includes(g.status))
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.giverName} · {g.code}
                      {g.amountExpected ? ` · ${formatCurrency(g.amountExpected, language)}` : ""}
                    </option>
                  ))}
              </select>
            </label>
          )}

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Nội dung chuyển tiền</span>
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Dán nội dung chuyển khoản / mã guest"
              value={transferContent}
              onChange={(event) => setTransferContent(event.target.value)}
              required
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Số tiền (VNĐ)</span>
            <input
              type="number"
              min={1000}
              step={1000}
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={transferAmount}
              onChange={(event) => setTransferAmount(event.target.value)}
              required
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTransferOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={sendWebhookTransfer.isPending || (accounts.data ?? []).length === 0}
            >
              {sendWebhookTransfer.isPending ? "Đang gửi webhook..." : "Gửi tiền qua Webhook"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal ghi nhận thủ công */}
      <Modal
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        title="Ghi nhận tiền mừng thủ công"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            recordManual.mutate();
          }}
        >
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Hình thức</span>
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={recordMethod}
              onChange={(event) => setRecordMethod(event.target.value as "CASH" | "TRANSFER")}
            >
              <option value="CASH">Tiền mặt (Phong bì)</option>
              <option value="TRANSFER">Chuyển khoản</option>
            </select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Tên người gửi</span>
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Nhập tên người gửi"
              value={recordGiverName}
              onChange={(event) => setRecordGiverName(event.target.value)}
              required
              maxLength={120}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Số tiền (VNĐ)</span>
            <input
              type="number"
              min={1000}
              step={1000}
              className="rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Nhập số tiền"
              value={recordAmount}
              onChange={(event) => setRecordAmount(event.target.value)}
              required
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRecordOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" size="sm" disabled={recordManual.isPending}>
              {recordManual.isPending ? "Đang lưu..." : "Ghi nhận"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
