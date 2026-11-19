"use client";
import { GiftCardsPreview } from "./gift-settings-panel";
import { useState } from "react";
import Image from "next/image";
import { Copy } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { claimGuestGift, getGuestGiftPage } from "../api/gifts.api";
import { useLocale } from "@/i18n/language-context";
import { formatCurrency } from "@/i18n/format";

export function GuestGiftPanel({ token }: { token: string }) {
  const { t } = useTranslation("gifts");
  const { language } = useLocale();
  const { api } = useRuntime();
  const cache = useQueryClient();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const queryKey = ["guest-gifts", token];
  const page = useQuery({
    queryKey,
    queryFn: ({ signal }) => getGuestGiftPage(api, token, signal),
    refetchInterval: 10000,
  });
  const claim = useMutation({
    mutationFn: (id: string) => claimGuestGift(api, token, id),
    onSuccess: () => cache.invalidateQueries({ queryKey }),
    onError: () => setError(t("claimError")),
  });
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(t("copied"));
    } catch {
      setError(t("copyFailed"));
    }
  }
  if (page.isPending) return <p role="status">{t("loadingAccounts")}</p>;
  if (page.isError)
    return (
      <p role="alert" className="text-sm text-red-700">
        {t("loadFailed")}
      </p>
    );
  const data = page.data;
  if (data.mode === "MANUAL")
    return (
      <GiftCardsPreview
        settings={{
          mode: "MANUAL",
          recipients: data.manualQrCards.map((r) => ({
            role: r.role,
            enabled: true,
            bankBin: r.bankBin,
            accountNumber: r.accountNumber,
            accountName: r.accountName,
          })),
        }}
        banks={data.manualQrCards.map((r) => ({ bin: r.bankBin, name: r.bankName }))}
      />
    );
  if (data.mode === "UPLOADED")
    return (
      <GiftCardsPreview
        settings={{
          mode: "UPLOADED",
          recipients: data.uploadedQrCards.map((r) => ({ ...r, enabled: true })),
        }}
      />
    );
  return (
    <div className="space-y-4 text-left">
      <p className="text-sm text-muted-foreground">{t("instantQrHelp")}</p>
      {!data.qrEnabled ? (
        <p className="rounded-lg bg-muted p-3 text-sm">{t("qrUnavailable")}</p>
      ) : !data.qrCards.length ? (
        <p className="rounded-lg bg-muted p-3 text-sm">{t("noAccounts")}</p>
      ) : (
        <div
          className={`grid gap-4 ${data.qrCards.length > 1 ? "sm:grid-cols-2" : ""}`}
          data-gift-qr-cards
        >
          {data.qrCards.map((card) => (
            <article
              key={card.account.id}
              data-gift-qr-account={card.account.id}
              className="mx-auto w-full max-w-sm rounded-2xl border bg-card p-4 text-center"
            >
              <h3 className="text-lg font-semibold">
                {card.account.label || card.account.accountName}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">{card.account.bankName}</p>
              <Image
                src={card.qrImageUrl}
                alt={t("giftQrAlt")}
                width={270}
                height={320}
                unoptimized
                className="mx-auto my-3 h-auto w-full max-w-[270px] rounded-lg bg-white"
              />
              <p className="text-sm font-medium">{card.account.accountName}</p>
              <div className="mt-2 flex items-center justify-center gap-2 break-all text-sm">
                <span>{card.account.accountNumber}</span>
                <button
                  type="button"
                  className="shrink-0 rounded border p-2"
                  aria-label={t("copyAccount", { name: card.account.accountName })}
                  onClick={() => void copy(card.account.accountNumber)}
                >
                  <Copy size={14} />
                </button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{t("transferContent")}</p>
              <div className="mt-1 flex items-center justify-center gap-2">
                <strong className="break-all text-sm tracking-wide">{card.transferContent}</strong>
                <button
                  type="button"
                  className="shrink-0 rounded border p-2"
                  aria-label={t("copyContent", { name: card.account.accountName })}
                  onClick={() => void copy(card.transferContent)}
                >
                  <Copy size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {!!data.myGifts.length && (
        <details className="border-t pt-3">
          <summary className="cursor-pointer text-sm font-medium">{t("myTransfers")}</summary>
          <div className="mt-3 grid gap-3">
            {data.myGifts.map((gift) => (
              <article key={gift.id} className="rounded-xl border p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <strong>{formatCurrency(gift.amount ?? 0, language)}</strong>
                  <span>
                    {gift.status === "PAID"
                      ? t("paid")
                      : gift.status === "PENDING"
                        ? t("pending")
                        : gift.status === "CLAIMED"
                          ? t("claimed")
                          : gift.status}
                  </span>
                </div>
                {gift.account && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {gift.account.label || gift.account.accountName} · {gift.account.bankName}
                  </p>
                )}
                {gift.transferContent && <p className="mt-1 text-xs">{gift.transferContent}</p>}
                {gift.status === "PENDING" && (
                  <Button
                    className="mt-2"
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={claim.isPending}
                    onClick={() => claim.mutate(gift.id)}
                  >
                    {t("markTransferred")}
                  </Button>
                )}
              </article>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
