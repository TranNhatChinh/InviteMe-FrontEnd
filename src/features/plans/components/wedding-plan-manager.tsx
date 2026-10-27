"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Crown,
  History,
  Info,
  Loader2,
  Lock,
  QrCode,
} from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import { usePermission } from "@/shared/components/permission-guard";
import { Button } from "@/shared/ui/button";
import { formatCurrency, formatDate } from "@/i18n/format";
import {
  createPlanOrder,
  getPublicPlans,
  getWeddingPlan,
  getWeddingPlanOrders,
  type PlanOrderDto,
} from "../api/plans.api";
import { VietQrPaymentModal } from "./vietqr-payment-modal";

interface WeddingPlanManagerProps {
  weddingId: string;
}

export function WeddingPlanManager({ weddingId }: WeddingPlanManagerProps) {
  const { api } = useRuntime();
  const queryClient = useQueryClient();
  const { isOwner } = usePermission();
  const [selectedOrder, setSelectedOrder] = useState<PlanOrderDto | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Fetch current wedding plan
  const planQuery = useQuery({
    queryKey: ["wedding-plan", weddingId],
    queryFn: ({ signal }) => getWeddingPlan(api, weddingId, signal),
  });

  // Fetch public plans
  const publicPlansQuery = useQuery({
    queryKey: ["public-plans"],
    queryFn: ({ signal }) => getPublicPlans(api, signal),
  });

  // Fetch order history
  const ordersQuery = useQuery({
    queryKey: ["wedding-plan-orders", weddingId],
    queryFn: ({ signal }) => getWeddingPlanOrders(api, weddingId, signal),
  });

  // Order creation mutation
  const createOrderMutation = useMutation({
    mutationFn: (planCode: string) => createPlanOrder(api, weddingId, planCode),
    onSuccess: (order) => {
      setOrderError(null);
      void queryClient.invalidateQueries({ queryKey: ["wedding-plan-orders", weddingId] });
      setSelectedOrder(order);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Không thể khởi tạo đơn hàng. Vui lòng thử lại.";
      setOrderError(message);
    },
  });

  if (planQuery.isPending) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (planQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-6 text-center text-destructive space-y-2">
        <AlertCircle className="size-8 mx-auto" />
        <h3 className="font-semibold">Không thể tải thông tin gói cước</h3>
        <p className="text-sm">Vui lòng tải lại trang hoặc liên hệ hỗ trợ.</p>
        <Button variant="outline" size="sm" onClick={() => void planQuery.refetch()}>
          Tải lại
        </Button>
      </div>
    );
  }

  const currentPlan = planQuery.data;
  const usage = currentPlan.usage;
  const limits = currentPlan.limits;
  const publicPlans = publicPlansQuery.data ?? [];

  // Helper for quota progress bar
  const renderQuota = (label: string, used: number, max: number | null | undefined, unit = "") => {
    const isUnlimited = max === null || max === undefined;
    const percentage = isUnlimited ? 0 : Math.min(100, Math.round((used / max) * 100));
    const isNearLimit = !isUnlimited && percentage >= 85;

    return (
      <div className="space-y-1.5 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">
            {used} / {isUnlimited ? "Không giới hạn" : `${max} ${unit}`}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all duration-300 ${
              isUnlimited
                ? "bg-primary w-full opacity-40"
                : isNearLimit
                  ? "bg-amber-500"
                  : "bg-primary"
            }`}
            style={{ width: isUnlimited ? "100%" : `${percentage}%` }}
          />
        </div>
        {!isUnlimited && isNearLimit && (
          <p className="text-xs text-amber-600 font-medium">Sắp đạt hạn mức của gói</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-10">
      {/* Current Plan Overview Card */}
      <section className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Gói hiện tại
              </span>
              {currentPlan.legacy && (
                <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                  Legacy (Vĩnh viễn)
                </span>
              )}
            </div>
            <h2 className="font-serif text-3xl font-normal text-foreground flex items-center gap-2">
              <Crown className="size-6 text-primary" />
              <span>{currentPlan.planName}</span>
            </h2>
          </div>

          <div className="text-right">
            {currentPlan.publicLinkUntil ? (
              <p className="text-xs text-muted-foreground">
                Website mở đến:{" "}
                <strong className="text-foreground">
                  {formatDate(currentPlan.publicLinkUntil, "vi", { dateStyle: "medium" })}
                </strong>
              </p>
            ) : (
              <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="size-3.5" />
                Website duy trì vĩnh viễn
              </p>
            )}
          </div>
        </div>

        {/* Quotas Grid */}
        <div className="mt-6 space-y-4">
          <h3 className="font-semibold text-sm text-foreground">Hạn mức đã sử dụng</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderQuota("Khách mời & Chỗ ngồi", usage.guestPlaces, limits.guestPlaces, "khách")}
            {renderQuota("Ảnh kỷ niệm đã tải", usage.mediaImages, limits.mediaImages, "ảnh")}
            {renderQuota("Lượt gửi Email thiệp", usage.emailInvites, limits.emailInvites, "lượt")}
            {renderQuota("Lượt gửi SMS thiệp", usage.smsInvites, limits.smsInvites, "SMS")}
            {renderQuota("Sơ đồ bàn tiệc", usage.seatingTables, limits.seatingTables, "bàn")}
            {renderQuota("Co-host cùng quản lý", usage.coHosts, limits.coHosts, "người")}
            {renderQuota("Trợ lý AI viết lời cảm ơn", usage.aiThankYouRuns, limits.aiThankYouRuns, "lượt")}
          </div>
        </div>

        {/* Feature Pills */}
        <div className="mt-6 border-t border-border pt-6">
          <h3 className="font-semibold text-sm text-foreground mb-3">Tính năng đã mở khóa</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 border ${limits.checkin ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border bg-muted text-muted-foreground line-through"}`}>
              {limits.checkin ? <Check className="size-3" /> : <Lock className="size-3" />}
              Check-in QR tại sảnh tiệc
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 border ${limits.giftQr ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border bg-muted text-muted-foreground line-through"}`}>
              {limits.giftQr ? <Check className="size-3" /> : <Lock className="size-3" />}
              Mừng cưới VietQR &amp; Sổ mừng
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 border ${limits.customSlug ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border bg-muted text-muted-foreground line-through"}`}>
              {limits.customSlug ? <Check className="size-3" /> : <Lock className="size-3" />}
              Tùy chỉnh link website riêng
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 border ${limits.publicSeatLookup ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border bg-muted text-muted-foreground line-through"}`}>
              {limits.publicSeatLookup ? <Check className="size-3" /> : <Lock className="size-3" />}
              Khách tự tra cứu bàn tiệc
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 border ${!limits.brandingBadge ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border bg-muted text-muted-foreground"}`}>
              {!limits.brandingBadge ? <Check className="size-3" /> : <Info className="size-3" />}
              {!limits.brandingBadge ? "Đã xóa logo InviteMe" : "Hiển thị logo InviteMe"}
            </span>
          </div>
        </div>
      </section>

      {/* Upgrade Options */}
      {isOwner && currentPlan.planCode !== "PREMIUM" && !currentPlan.legacy && (
        <section className="space-y-6">
          <div>
            <h2 className="font-serif text-2xl font-normal text-foreground">Nâng cấp gói dịch vụ</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Mở rộng hạn mức khách mời, sơ đồ bàn tiệc không giới hạn và nhận toàn bộ tính năng cao cấp.
            </p>
          </div>

          {orderError && (
            <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive font-medium">
              {orderError}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {publicPlans
              .filter((p) => p.code !== "FREE" && p.code !== currentPlan.planCode)
              .map((plan) => {
                const isPremium = plan.code === "PREMIUM";
                return (
                  <div
                    key={plan.code}
                    className={`rounded-3xl border p-6 sm:p-8 flex flex-col justify-between shadow-sm transition-all ${
                      isPremium
                        ? "border-amber-400/80 bg-gradient-to-b from-card via-card to-amber-50/20 dark:to-amber-950/20 ring-1 ring-amber-400/30"
                        : "border-primary/50 bg-card ring-1 ring-primary/20"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="font-serif text-2xl font-normal text-foreground">{plan.name}</h3>
                        {isPremium ? (
                          <span className="rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 px-3 py-0.5 text-xs font-semibold">
                            VIP Không giới hạn
                          </span>
                        ) : (
                          <span className="rounded-full bg-primary/20 text-primary px-3 py-0.5 text-xs font-semibold">
                            Phổ biến
                          </span>
                        )}
                      </div>

                      <div className="mt-4 flex items-baseline gap-1">
                        <span className="font-serif text-3xl font-bold text-foreground">
                          {formatCurrency(plan.price, "vi")}
                        </span>
                        <span className="text-xs text-muted-foreground">/ trọn gói đám cưới</span>
                      </div>

                      <ul className="mt-6 space-y-2.5 text-sm">
                        <li className="flex items-center gap-2.5">
                          <Check className="size-4 text-emerald-600 shrink-0" />
                          <span>
                            <strong>{plan.limits.guestPlaces}</strong> khách mời &amp; chỗ ngồi
                          </span>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <Check className="size-4 text-emerald-600 shrink-0" />
                          <span>
                            <strong>{plan.limits.mediaImages}</strong> ảnh kỷ niệm album
                          </span>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <Check className="size-4 text-emerald-600 shrink-0" />
                          <span>Không giới hạn bàn tiệc sơ đồ</span>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <Check className="size-4 text-emerald-600 shrink-0" />
                          <span>Check-in QR &amp; VietQR mừng cưới</span>
                        </li>
                        <li className="flex items-center gap-2.5">
                          <Check className="size-4 text-emerald-600 shrink-0" />
                          <span>Xóa hoàn toàn logo InviteMe</span>
                        </li>
                      </ul>
                    </div>

                    <div className="mt-8 pt-4 border-t border-border/60">
                      <Button
                        className={`w-full rounded-full py-5 text-sm font-semibold gap-2 ${
                          isPremium
                            ? "bg-amber-600 text-white hover:bg-amber-700 shadow-md"
                            : "bg-primary text-primary-foreground hover:bg-primary-hover shadow-md"
                        }`}
                        onClick={() => createOrderMutation.mutate(plan.code)}
                        disabled={createOrderMutation.isPending}
                      >
                        {createOrderMutation.isPending && (
                          <Loader2 className="size-4 animate-spin" />
                        )}
                        <span>Nâng cấp lên {plan.name}</span>
                        <ArrowRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* Order History */}
      {ordersQuery.data && ordersQuery.data.length > 0 && (
        <section className="space-y-4 rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border pb-4">
            <History className="size-5 text-muted-foreground" />
            <h3 className="font-serif text-xl font-normal text-foreground">Lịch sử đơn hàng</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="py-3 px-3">Mã đơn</th>
                  <th className="py-3 px-3">Gói dịch vụ</th>
                  <th className="py-3 px-3">Số tiền</th>
                  <th className="py-3 px-3">Trạng thái</th>
                  <th className="py-3 px-3">Thời gian tạo</th>
                  <th className="py-3 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {ordersQuery.data.map((order) => {
                  const isPaid = order.status === "PAID";
                  const isPending = order.status === "PENDING";
                  return (
                    <tr key={order.id} className="border-b border-border/40 hover:bg-muted/30">
                      <td className="py-3 px-3 font-mono font-medium">{order.code}</td>
                      <td className="py-3 px-3 font-medium">{order.planName}</td>
                      <td className="py-3 px-3 font-semibold">{formatCurrency(order.amount, "vi")}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            isPaid
                              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                              : isPending
                                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isPaid ? "Đã thanh toán" : isPending ? "Chờ chuyển khoản" : "Đã hủy"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground text-xs">
                        {formatDate(order.createdAt, "vi", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {isPending && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full text-xs gap-1.5"
                            onClick={() => setSelectedOrder(order)}
                          >
                            <QrCode className="size-3.5" />
                            <span>Mã VietQR</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Payment Modal */}
      {selectedOrder && (
        <VietQrPaymentModal
          weddingId={weddingId}
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onSuccess={() => {
            setSelectedOrder(null);
            void planQuery.refetch();
          }}
        />
      )}
    </div>
  );
}
