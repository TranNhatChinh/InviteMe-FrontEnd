"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Trans, useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Sparkles, X, AlertTriangle } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useRuntime } from "@/core/config/runtime";
import { formatCurrency } from "@/i18n/format";
import {
  cancelPlanOrder,
  getWeddingPlanOrder,
  simulatePlanPayment,
  type PlanOrderDto,
} from "../api/plans.api";

interface VietQrPaymentModalProps {
  weddingId: string;
  order: PlanOrderDto;
  onClose: () => void;
  onSuccess: () => void;
}

export function VietQrPaymentModal({
  weddingId,
  order: initialOrder,
  onClose,
  onSuccess,
}: VietQrPaymentModalProps) {
  const { api } = useRuntime();
  const { t } = useTranslation("plans");
  const queryClient = useQueryClient();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Poll order status every 3 seconds while PENDING
  const orderQuery = useQuery({
    queryKey: ["wedding-plan-order", weddingId, initialOrder.id],
    queryFn: ({ signal }) => getWeddingPlanOrder(api, weddingId, initialOrder.id, signal),
    initialData: initialOrder,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === "PAID" || data.status === "CANCELLED" || data.status === "EXPIRED")) {
        return false;
      }
      return 3000;
    },
  });

  const order = orderQuery.data ?? initialOrder;
  const isPaid = order.status === "PAID";
  const isCancelled = order.status === "CANCELLED";
  const isExpired = order.status === "EXPIRED";

  useEffect(() => {
    if (isPaid) {
      void queryClient.invalidateQueries({ queryKey: ["wedding-plan", weddingId] });
      void queryClient.invalidateQueries({ queryKey: ["wedding-plan-orders", weddingId] });
      const timer = setTimeout(() => {
        onSuccess();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isPaid, queryClient, weddingId, onSuccess]);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback
    }
  };

  const cancelMutation = useMutation({
    mutationFn: () => cancelPlanOrder(api, weddingId, order.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["wedding-plan-order", weddingId, order.id] });
      void queryClient.invalidateQueries({ queryKey: ["wedding-plan-orders", weddingId] });
      onClose();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : t("payment.cancelError");
      setCancelError(message);
    },
  });

  const simulateMutation = useMutation({
    mutationFn: () => simulatePlanPayment(api, weddingId, order.id),
    onSuccess: () => {
      void orderQuery.refetch();
    },
  });

  // Calculate remaining time
  const [timeLeft, setTimeLeft] = useState<string>("");
  useEffect(() => {
    const updateTime = () => {
      const diff = new Date(order.expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft(t("payment.expired"));
        return;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes}:${seconds < 10 ? "0" : ""}${seconds}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [order.expiresAt, t]);

  const isDev =
    process.env.NODE_ENV === "development" ||
    (typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8 text-foreground">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              {t("payment.eyebrow")}
            </span>
            <h2 id="payment-modal-title" className="mt-1 font-serif text-2xl font-semibold">
              {t("payment.title", { name: order.planName })}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={t("payment.close")}
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        {isPaid ? (
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 ring-8 ring-emerald-500/10">
              <Check className="size-8" />
            </div>
            <h3 className="font-serif text-2xl font-semibold text-emerald-600">
              {t("payment.successTitle")}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              <Trans t={t} i18nKey="payment.successBody" values={{ name: order.planName }} components={{ strong: <strong /> }} />
            </p>
          </div>
        ) : isCancelled || isExpired ? (
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-500/20 text-amber-600">
              <AlertTriangle className="size-8" />
            </div>
            <h3 className="font-serif text-xl font-semibold">
              {isCancelled ? t("payment.orderCancelled") : t("payment.orderExpired")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("payment.createNewOrder")}
            </p>
            <Button onClick={onClose} variant="outline" className="mt-2">
              {t("payment.close")}
            </Button>
          </div>
        ) : (
          <div className="space-y-6 pt-4">
            {/* VietQR Code preview */}
            <div className="flex flex-col items-center justify-center rounded-xl bg-white p-4 shadow-inner border border-border">
              {order.qrImageUrl ? (
                <div className="relative size-60">
                  <Image
                    src={order.qrImageUrl}
                    alt={t("payment.qrAlt", { code: order.code })}
                    fill
                    sizes="240px"
                    className="object-contain"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex size-60 items-center justify-center text-muted-foreground">
                  <Loader2 className="size-8 animate-spin" />
                </div>
              )}
              <div className="mt-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="inline-block size-2 animate-ping rounded-full bg-emerald-500" />
                <span>{t("payment.scanHint", { time: timeLeft })}</span>
              </div>
            </div>

            {/* Bank details with copy buttons */}
            <div className="space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
              <div className="flex items-center justify-between py-1 border-b border-border/50">
                <span className="text-muted-foreground">{t("payment.bank")}</span>
                <span className="font-medium text-foreground">{order.bankName}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/50">
                <span className="text-muted-foreground">{t("payment.accountNumber")}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-foreground">{order.accountNumber}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(order.accountNumber, "account")}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    {copiedField === "account" ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                    <span>{copiedField === "account" ? t("payment.copied") : t("payment.copy")}</span>
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/50">
                <span className="text-muted-foreground">{t("payment.accountName")}</span>
                <span className="font-medium text-foreground">{order.accountName}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/50">
                <span className="text-muted-foreground">{t("payment.amount")}</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-primary text-base">
                    {formatCurrency(order.amount, "vi")}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(String(order.amount), "amount")}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    {copiedField === "amount" ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                    <span>{copiedField === "amount" ? t("payment.copied") : t("payment.copy")}</span>
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-foreground">{t("payment.transferContent")}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800">
                    {order.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(order.code, "code")}
                    className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold"
                  >
                    {copiedField === "code" ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                    <span>{copiedField === "code" ? t("payment.copied") : t("payment.copy")}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Note */}
            <p className="text-xs text-muted-foreground text-center">
              {t("payment.autoNote")}
            </p>

            {cancelError && (
              <p className="text-xs text-destructive text-center">{cancelError}</p>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="text-muted-foreground hover:text-destructive w-full sm:w-auto"
              >
                {cancelMutation.isPending ? t("payment.cancelling") : t("payment.cancelOrder")}
              </Button>

              {/* Dev mode simulation button */}
              {isDev && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => simulateMutation.mutate()}
                  disabled={simulateMutation.isPending}
                  className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300 hover:bg-amber-500/20 w-full sm:w-auto gap-1 text-xs"
                >
                  <Sparkles className="size-3" />
                  {simulateMutation.isPending ? t("payment.simulating") : t("payment.simulate")}
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => void orderQuery.refetch()}
                disabled={orderQuery.isFetching}
                className="w-full sm:w-auto gap-1.5"
              >
                {orderQuery.isFetching && <Loader2 className="size-3.5 animate-spin" />}
                <span>{t("payment.checkAgain")}</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
