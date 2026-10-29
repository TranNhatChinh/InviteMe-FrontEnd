"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { usePermission } from "@/shared/components/permission-guard";
import { Button } from "@/shared/ui/button";
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
  removeGiftAccount,
  syncGiftBankHub,
  unlinkGiftBankHub,
} from "../api/gifts.api";
import { useLocale } from "@/i18n/language-context";
import { formatCurrency, formatDate, formatNumber } from "@/i18n/format";

export function CoupleGiftManager({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("gifts");
  const { language } = useLocale();
  const { api } = useRuntime();
  const queryClient = useQueryClient();
  const { can, isWeddingWide } = usePermission();
  const editable = can("GIFT_EDIT") && isWeddingWide("GIFT_EDIT");
  const [pageNumber, setPageNumber] = useState(1);
  const [search, setSearch] = useState("");
  const [bankBin, setBankBin] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hub, setHub] = useState<{ url: string; mode: "link" | "unlink" } | null>(null);
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
  const ledger = useQuery({
    queryKey: ["gift-ledger", weddingId, pageNumber, search],
    queryFn: ({ signal }) => getGiftLedger(api, weddingId, pageNumber, search, signal),
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["gift-accounts", weddingId] }),
      queryClient.invalidateQueries({ queryKey: ["gift-summary", weddingId] }),
      queryClient.invalidateQueries({ queryKey: ["gift-ledger", weddingId] }),
    ]);
  };
  const add = useMutation({
    mutationFn: () =>
      addGiftAccount(api, weddingId, {
        bankBin,
        accountNumber,
        accountName,
        label: label || undefined,
      }),
    onSuccess: async () => {
      setError("");
      setAccountNumber("");
      setAccountName("");
      setLabel("");
      await refresh();
    },
    onError: () => setError(t("addAccountFailed")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeGiftAccount(api, weddingId, id),
    onSuccess: refresh,
    onError: () => setError(t("deleteAccountFailed")),
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
      return { url: link.hostedLinkUrl, mode: accountId ? ("unlink" as const) : ("link" as const) };
    },
    onSuccess: (opened) => {
      setError("");
      setNotice("");
      setHub(opened);
    },
    onError: bankHubError,
  });
  const sync = useMutation({
    mutationFn: () => syncGiftBankHub(api, weddingId),
    onSuccess: async (result) => {
      setNotice(
        result.notAdded.length > 0
          ? t("bankHub.notAdded", { accounts: result.notAdded.join(", ") })
          : t("bankHub.synced", { count: result.accounts.filter((a) => a.bankHubLinked).length }),
      );
      await refresh();
    },
    onError: bankHubError,
  });
  const syncMutate = sync.mutate;
  // SePay's page is done (or closed): read the linked accounts again either way.
  const closeHub = useCallback(() => {
    setHub(null);
    syncMutate();
  }, [syncMutate]);
  const confirm = useMutation({
    mutationFn: (id: string) => confirmGift(api, weddingId, id),
    onSuccess: refresh,
    onError: () => setError(t("confirmGiftFailed")),
  });
  const data = summary.data;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("ledgerTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("ledgerDescription")}</p>
      </header>
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
      <section className="space-y-3 rounded-xl border p-4">
        <div>
          <h2 className="font-semibold">{t("accountsTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("accountLimit")}</p>
        </div>
        {editable && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">{t("bankHub.title")}</p>
              <p className="text-muted-foreground">{t("bankHub.description")}</p>
            </div>
            <Button
              type="button"
              disabled={openHub.isPending || sync.isPending}
              onClick={() => openHub.mutate(null)}
            >
              {openHub.isPending && openHub.variables === null
                ? t("bankHub.opening")
                : sync.isPending
                  ? t("bankHub.syncing")
                  : t("bankHub.link")}
            </Button>
          </div>
        )}
        {accounts.data?.map((account) => (
          <div
            key={account.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-3 text-sm"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span>
                <strong>{account.label || account.bankName}</strong> · {account.accountName} ·{" "}
                {account.accountNumber}
              </span>
              {account.bankHubLinked && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {t("bankHub.autoConfirmed")}
                </span>
              )}
            </span>
            {editable && (
              <span className="flex gap-2">
                {account.bankHubLinked && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={openHub.isPending || sync.isPending}
                    onClick={() => openHub.mutate(account.id)}
                  >
                    {t("bankHub.unlink")}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(account.id)}
                >
                  {t("delete")}
                </Button>
              </span>
            )}
          </div>
        ))}
        {editable && (accounts.data?.length ?? 0) < 2 && (
          <form
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              add.mutate();
            }}
          >
            <select
              className="rounded-md border bg-background px-3 py-2"
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
            <input
              className="rounded-md border bg-background px-3 py-2"
              placeholder={t("accountNumber")}
              value={accountNumber}
              onChange={(event) => setAccountNumber(event.target.value)}
              required
              maxLength={30}
            />
            <input
              className="rounded-md border bg-background px-3 py-2"
              placeholder={t("accountName")}
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              required
              maxLength={100}
            />
            <input
              className="rounded-md border bg-background px-3 py-2"
              placeholder={t("accountLabel")}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={30}
            />
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? t("saving") : t("addAccount")}
            </Button>
          </form>
        )}
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">{t("transactions")}</h2>
            <p className="text-sm text-muted-foreground">{t("reconcileHint")}</p>
          </div>
          <input
            aria-label={t("searchTransaction")}
            className="rounded-md border bg-background px-3 py-2"
            placeholder={t("searchNameOrCode")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPageNumber(1);
            }}
          />
        </div>
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
                {ledger.data.items.map((gift) => (
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
                {ledger.data.items.length === 0 && (
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
      <BankHubLinkDialog
        url={hub?.url ?? null}
        mode={hub?.mode ?? "link"}
        onClose={closeHub}
        onFinished={closeHub}
      />
    </div>
  );
}
