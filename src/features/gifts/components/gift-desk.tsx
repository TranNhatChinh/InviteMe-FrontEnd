"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { ApiError } from "@/core/api/api-error";
import { usePermission } from "@/shared/components/permission-guard";
import { PageHeader } from "@/shared/components/page-header";
import { ConfirmDialog } from "@/shared/feedback/confirm-dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/utils";
import { useLocale } from "@/i18n/language-context";
import { formatCurrency, formatDate, formatNumber } from "@/i18n/format";
import {
  cancelGift,
  getReceptionGifts,
  recordGift,
  searchDeskGuests,
  uploadGiftProof,
  type ReceptionGift,
  type RecordGiftInput,
} from "../api/gifts.api";

type Method = "CASH" | "ITEM" | "TRANSFER";
type Giver = { guestId: string; name: string } | null;

const MIN_AMOUNT = 10_000;
const MAX_AMOUNT = 100_000_000;
const deskKey = (weddingId: string) => ["gift-desk", weddingId] as const;

/** Digits only, so "500.000" and "500 000" both read as 500000. */
const parseAmount = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : undefined;
};

/**
 * The reception desk: whoever sits there (the couple or a co-host with GIFT_RECORD) writes down each envelope, present
 * or transfer shown on a phone, and sees what was already written so nothing is entered twice.
 */
export function GiftDesk({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("gifts", { keyPrefix: "desk" });
  const { language } = useLocale();
  const { api } = useRuntime();
  const { can } = usePermission();
  const queryClient = useQueryClient();
  const formId = useId();
  const attemptKey = useRef<string | null>(null);

  const [method, setMethod] = useState<Method>("CASH");
  const [giver, setGiver] = useState<Giver>(null);
  const [giverName, setGiverName] = useState("");
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [itemValue, setItemValue] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  const canSearchGuests = can("CHECKIN_MANAGE");
  const canCancel = can("GIFT_EDIT");

  const gifts = useQuery({
    queryKey: deskKey(weddingId),
    queryFn: ({ signal }) => getReceptionGifts(api, weddingId, signal),
    refetchInterval: 30_000,
  });
  const guests = useQuery({
    queryKey: ["gift-desk-guests", weddingId, search.trim()],
    queryFn: ({ signal }) => searchDeskGuests(api, weddingId, search.trim(), signal),
    enabled: canSearchGuests && !giver && search.trim().length >= 2,
    staleTime: 30_000,
  });

  const counts = useMemo(() => {
    const active = (gifts.data ?? []).filter((gift) => gift.status !== "CANCELLED");
    return {
      cash: active.filter((gift) => gift.method === "CASH").length,
      items: active.filter((gift) => gift.method === "ITEM").length,
      transfers: active.filter((gift) => gift.method === "TRANSFER").length,
    };
  }, [gifts.data]);

  function resetForm() {
    setGiver(null);
    setGiverName("");
    setSearch("");
    setAmount("");
    setItemName("");
    setQuantity("1");
    setItemValue("");
    setProof(null);
    setErrors({});
    attemptKey.current = null;
  }

  const record = useMutation({
    mutationFn: async (input: RecordGiftInput) => {
      // One key per attempt: a retry after a timeout cannot write the same envelope twice.
      attemptKey.current ??= crypto.randomUUID();
      return recordGift(api, weddingId, input, attemptKey.current);
    },
    onSuccess: async (gift) => {
      setNotice(t(`recorded.${method}`, { name: gift.giverName }));
      resetForm();
      await queryClient.invalidateQueries({ queryKey: deskKey(weddingId) });
    },
    onError: (error) =>
      setErrors({
        form:
          error instanceof ApiError && error.code === "network"
            ? t("errors.network")
            : t("errors.failed"),
      }),
  });
  const cancel = useMutation({
    mutationFn: (giftId: string) => cancelGift(api, weddingId, giftId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deskKey(weddingId) }),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    const next: Record<string, string> = {};
    const who = giver ? { guestId: giver.guestId } : { giverName: giverName.trim() };
    if (!giver && !giverName.trim()) next.giver = t("errors.giver");

    let input: RecordGiftInput | null = null;
    if (method === "ITEM") {
      const qty = Number(quantity);
      if (!itemName.trim()) next.itemName = t("errors.itemName");
      if (!Number.isInteger(qty) || qty < 1 || qty > 1000) next.quantity = t("errors.quantity");
      input = {
        method,
        itemName: itemName.trim(),
        quantity: qty,
        estimatedValue: parseAmount(itemValue),
        ...who,
      };
    } else {
      const value = parseAmount(amount);
      const required = method === "TRANSFER";
      if (
        (required && value === undefined) ||
        (value !== undefined && (value < MIN_AMOUNT || value > MAX_AMOUNT))
      )
        next.amount = t("errors.amount", {
          min: formatCurrency(MIN_AMOUNT, language),
          max: formatCurrency(MAX_AMOUNT, language),
        });
      input =
        method === "CASH"
          ? { method, amount: value, ...who }
          : { method, amount: value ?? 0, ...who };
    }
    setErrors(next);
    if (Object.keys(next).length || !input) return;

    if (input.method === "TRANSFER" && proof) {
      try {
        const uploaded = await uploadGiftProof(api, weddingId, proof);
        input = { ...input, proofId: uploaded.id };
      } catch {
        setErrors({ proof: t("errors.proofUpload") });
        return;
      }
    }
    record.mutate(input);
  }

  const fieldError = (key: string) =>
    errors[key] ? (
      <p id={`${formId}-${key}-error`} className="text-sm text-destructive">
        {errors[key]}
      </p>
    ) : null;
  const describedBy = (key: string) => (errors[key] ? `${formId}-${key}-error` : undefined);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={
          gifts.data
            ? t("summary", {
                cash: formatNumber(counts.cash, language),
                items: formatNumber(counts.items, language),
                transfers: formatNumber(counts.transfers, language),
              })
            : t("description")
        }
      />

      {notice && (
        <p role="status" className="rounded-lg bg-success/10 px-4 py-3 text-sm text-foreground">
          {notice}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        <form
          onSubmit={(event) => void submit(event)}
          aria-labelledby={`${formId}-title`}
          className="space-y-5 rounded-xl border border-foreground/10 bg-card p-5 lg:sticky lg:top-6"
          noValidate
        >
          <h2 id={`${formId}-title`} className="text-lg font-semibold">
            {t("formTitle")}
          </h2>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("method")}</legend>
            <div className="grid grid-cols-3 rounded-lg bg-muted p-1">
              {(["CASH", "ITEM", "TRANSFER"] as const).map((value) => (
                <label
                  key={value}
                  className={cn(
                    "flex h-10 cursor-pointer items-center justify-center rounded-md px-2 text-center text-sm transition-colors",
                    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    method === value
                      ? "bg-background font-medium text-foreground ring-1 ring-foreground/10"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name={`${formId}-method`}
                    aria-label={t(`methods.${value}`)}
                    className="sr-only"
                    checked={method === value}
                    onChange={() => {
                      setMethod(value);
                      setErrors({});
                    }}
                  />
                  {t(`methods.${value}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label htmlFor={`${formId}-giver`} className="text-sm font-medium">
              {t("giver")}
            </label>
            {giver ? (
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-foreground/15 px-3">
                <span className="truncate text-sm font-medium">{giver.name}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setGiver(null)}>
                  {t("changeGiver")}
                </Button>
              </div>
            ) : canSearchGuests ? (
              <>
                <Input
                  id={`${formId}-giver`}
                  value={search || giverName}
                  autoComplete="off"
                  aria-describedby={cn(`${formId}-giver-hint`, describedBy("giver"))}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setGiverName(event.target.value);
                  }}
                />
                <p id={`${formId}-giver-hint`} className="text-sm text-muted-foreground">
                  {t("giverSearchHint")}
                </p>
                {guests.data && guests.data.length > 0 && (
                  <ul className="divide-y divide-foreground/10 rounded-lg border border-foreground/10">
                    {guests.data.slice(0, 5).map((guest) => {
                      const name = [guest.honorific, guest.recipientName].filter(Boolean).join(" ");
                      return (
                        <li key={guest.guestId}>
                          <button
                            type="button"
                            className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => {
                              setGiver({ guestId: guest.guestId, name });
                              setSearch("");
                              setGiverName("");
                            }}
                          >
                            <span className="truncate">{name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {t(`sides.${guest.side}`, { defaultValue: "" })}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : (
              <Input
                id={`${formId}-giver`}
                value={giverName}
                autoComplete="off"
                aria-describedby={describedBy("giver")}
                onChange={(event) => setGiverName(event.target.value)}
              />
            )}
            {fieldError("giver")}
          </div>

          {method === "ITEM" ? (
            <>
              <div className="space-y-2">
                <label htmlFor={`${formId}-item`} className="text-sm font-medium">
                  {t("itemName")}
                </label>
                <Input
                  id={`${formId}-item`}
                  value={itemName}
                  maxLength={150}
                  aria-describedby={describedBy("itemName")}
                  onChange={(event) => setItemName(event.target.value)}
                />
                {fieldError("itemName")}
              </div>
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
                <div className="space-y-2">
                  <label htmlFor={`${formId}-qty`} className="text-sm font-medium">
                    {t("quantity")}
                  </label>
                  <Input
                    id={`${formId}-qty`}
                    inputMode="numeric"
                    value={quantity}
                    aria-describedby={describedBy("quantity")}
                    onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor={`${formId}-value`} className="text-sm font-medium">
                    {t("itemValue")}
                  </label>
                  <Input
                    id={`${formId}-value`}
                    inputMode="numeric"
                    value={itemValue}
                    onChange={(event) => setItemValue(event.target.value)}
                  />
                </div>
              </div>
              {fieldError("quantity")}
            </>
          ) : (
            <div className="space-y-2">
              <label htmlFor={`${formId}-amount`} className="text-sm font-medium">
                {method === "CASH" ? t("amountOptional") : t("amount")}
              </label>
              <Input
                id={`${formId}-amount`}
                inputMode="numeric"
                value={amount}
                aria-describedby={cn(`${formId}-amount-hint`, describedBy("amount"))}
                onChange={(event) => setAmount(event.target.value)}
              />
              <p id={`${formId}-amount-hint`} className="text-sm text-muted-foreground">
                {parseAmount(amount) !== undefined
                  ? formatCurrency(parseAmount(amount) ?? 0, language)
                  : method === "CASH"
                    ? t("sealedHint")
                    : t("transferHint")}
              </p>
              {fieldError("amount")}
            </div>
          )}

          {method === "TRANSFER" && (
            <div className="space-y-2">
              <label htmlFor={`${formId}-proof`} className="text-sm font-medium">
                {t("proofOptional")}
              </label>
              <input
                id={`${formId}-proof`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                aria-describedby={cn(`${formId}-proof-hint`, describedBy("proof"))}
                className="block w-full text-sm file:mr-3 file:h-10 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:text-sm file:font-medium"
                onChange={(event) => setProof(event.target.files?.[0] ?? null)}
              />
              <p id={`${formId}-proof-hint`} className="text-sm text-muted-foreground">
                {t("proofHint")}
              </p>
              {fieldError("proof")}
            </div>
          )}

          {errors.form && (
            <p role="alert" className="text-sm text-destructive">
              {errors.form}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={record.isPending}>
            {record.isPending ? t("saving") : t(`submit.${method}`)}
          </Button>
        </form>

        <section aria-labelledby={`${formId}-list`} className="space-y-3">
          <h2 id={`${formId}-list`} className="text-lg font-semibold">
            {t("listTitle")}{" "}
            <span className="font-normal text-muted-foreground">
              {formatNumber(gifts.data?.length ?? 0, language)}
            </span>
          </h2>
          {gifts.isPending ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : gifts.isError ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-foreground/10 px-4 py-4 text-sm">
              <span className="text-destructive">{t("errors.load")}</span>
              <Button variant="outline" size="sm" onClick={() => void gifts.refetch()}>
                {t("retry")}
              </Button>
            </div>
          ) : gifts.data.length === 0 ? (
            <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-6 text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <ul className="divide-y divide-foreground/10 rounded-xl border border-foreground/10 bg-card">
              {gifts.data.map((gift) => (
                <DeskRow
                  key={gift.id}
                  gift={gift}
                  canCancel={canCancel}
                  cancelling={cancel.isPending && cancel.variables === gift.id}
                  onCancel={() => cancel.mutate(gift.id)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function DeskRow({
  gift,
  canCancel,
  cancelling,
  onCancel,
}: {
  gift: ReceptionGift;
  canCancel: boolean;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation("gifts", { keyPrefix: "desk" });
  const { language } = useLocale();
  const amount = gift.amountReceived ?? gift.amountExpected;
  const cancelled = gift.status === "CANCELLED";
  const what =
    gift.method === "ITEM"
      ? `${gift.itemName ?? t("methods.ITEM")}${gift.itemQuantity && gift.itemQuantity > 1 ? ` × ${gift.itemQuantity}` : ""}`
      : t(`methods.${gift.method}`, { defaultValue: gift.method });
  return (
    <li className={cn("flex items-start gap-4 px-4 py-3", cancelled && "text-muted-foreground")}>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium", cancelled && "line-through")}>{gift.giverName}</p>
        <p className="truncate text-sm text-muted-foreground">
          {what} ·{" "}
          {formatDate(gift.createdAt, language, {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
          })}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-medium tabular-nums">
          {gift.method === "ITEM"
            ? gift.itemValue
              ? formatCurrency(gift.itemValue, language)
              : "—"
            : amount
              ? formatCurrency(amount, language)
              : t("sealed")}
        </span>
        <span
          className={cn(
            "inline-flex h-5 flex-none items-center whitespace-nowrap rounded-full px-2 text-xs font-medium",
            gift.status === "PAID"
              ? "bg-success/15 text-foreground"
              : cancelled
                ? "bg-muted text-muted-foreground"
                : "bg-primary/10 text-foreground",
          )}
        >
          {t(`status.${gift.status}`, { defaultValue: gift.status })}
        </span>
      </div>
      {canCancel && !cancelled && gift.status !== "PAID" && (
        <ConfirmDialog
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              disabled={cancelling}
            >
              {t("cancel")}
            </Button>
          }
          title={t("cancelTitle")}
          description={t("cancelDescription", { name: gift.giverName })}
          cancelLabel={t("keep")}
          confirmLabel={t("cancel")}
          onConfirm={onCancel}
        />
      )}
    </li>
  );
}
