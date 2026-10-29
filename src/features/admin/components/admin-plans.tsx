"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  Edit,
  Filter,
  Gift,
  Loader2,
  Package,
  Receipt,
  Search,
  X,
} from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { formatCurrency, formatDate } from "@/i18n/format";
import {
  adminApi,
  type AdminPlan,
  type AdminPlanOrder,
  type PlanLimits,
} from "../api/admin.api";

export function AdminPlans() {
  const { api } = useRuntime();
  const { t } = useTranslation("plans");
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"plans" | "orders" | "payments" | "grant">("plans");

  // Edit plan modal state
  const [editingPlan, setEditingPlan] = useState<AdminPlan | null>(null);

  // Orders filter & pagination
  const [orderStatus, setOrderStatus] = useState<string>("");
  const [orderSearch, setOrderSearch] = useState<string>("");
  const [orderPage, setOrderPage] = useState<number>(1);

  // Payments filter & pagination
  const [paymentStatus, setPaymentStatus] = useState<string>("");
  const [paymentPage, setPaymentPage] = useState<number>(1);

  // Manual grant form state
  const [grantWeddingId, setGrantWeddingId] = useState("");
  const [grantPlanCode, setGrantPlanCode] = useState("BASIC");
  const [grantNote, setGrantNote] = useState("");
  const [grantMessage, setGrantMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Queries
  const plansQuery = useQuery({
    queryKey: ["admin-plans"],
    queryFn: ({ signal }) => adminApi.plans(api, signal),
  });

  const ordersQuery = useQuery({
    queryKey: ["admin-plan-orders", orderStatus, orderSearch, orderPage],
    queryFn: ({ signal }) =>
      adminApi.planOrders(
        api,
        {
          status: orderStatus || undefined,
          search: orderSearch || undefined,
          page: orderPage,
          pageSize: 20,
        },
        signal,
      ),
  });

  const paymentsQuery = useQuery({
    queryKey: ["admin-plan-payments", paymentStatus, paymentPage],
    queryFn: ({ signal }) =>
      adminApi.planPayments(
        api,
        {
          status: paymentStatus || undefined,
          page: paymentPage,
          pageSize: 20,
        },
        signal,
      ),
  });

  // Mutations
  const updatePlanMutation = useMutation({
    mutationFn: (vars: { code: string; body: { name: string; price: number; status: string; limits: PlanLimits } }) =>
      adminApi.updatePlan(api, vars.code, vars.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      setEditingPlan(null);
    },
  });

  const approveOrderMutation = useMutation({
    mutationFn: (vars: { orderId: string; note?: string }) =>
      adminApi.approvePlanOrder(api, vars.orderId, vars.note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-plan-orders"] });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: (vars: { orderId: string; note?: string }) =>
      adminApi.cancelPlanOrder(api, vars.orderId, vars.note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-plan-orders"] });
    },
  });

  const grantMutation = useMutation({
    mutationFn: () =>
      adminApi.grantWeddingPlan(api, grantWeddingId.trim(), {
        planCode: grantPlanCode,
        note: grantNote || undefined,
      }),
    onSuccess: () => {
      setGrantMessage({ type: "success", text: t("admin.grantSuccess", { plan: grantPlanCode }) });
      setGrantWeddingId("");
      setGrantNote("");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : t("admin.grantError");
      setGrantMessage({ type: "error", text: message });
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground font-serif">
          {t("admin.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("admin.subtitle")}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-2 text-sm">
        <button
          type="button"
          onClick={() => setActiveTab("plans")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
            activeTab === "plans"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Package className="size-4" />
          <span>{t("admin.tabs.plans", { count: plansQuery.data?.length ?? 0 })}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("orders")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
            activeTab === "orders"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Receipt className="size-4" />
          <span>{t("admin.tabs.orders")}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("payments")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
            activeTab === "payments"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <CreditCard className="size-4" />
          <span>{t("admin.tabs.payments")}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("grant")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
            activeTab === "grant"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Gift className="size-4" />
          <span>{t("admin.tabs.grant")}</span>
        </button>
      </div>

      {/* TAB 1: PLANS CATALOG */}
      {activeTab === "plans" && (
        <section className="space-y-4">
          {plansQuery.isPending ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : plansQuery.isError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
              {t("admin.plansError")}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              {plansQuery.data?.map((plan) => (
                <div
                  key={plan.code}
                  className="relative flex flex-col justify-between rounded-3xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-primary">
                        {plan.code}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          plan.status === "ACTIVE"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {plan.status}
                      </span>
                    </div>

                    <div>
                      <h2 className="font-serif text-xl font-normal text-foreground">{plan.name}</h2>
                      <div className="mt-2 text-2xl font-bold tracking-tight text-foreground font-serif">
                        {plan.price === 0 ? t("admin.free") : formatCurrency(plan.price, "vi")}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-muted/40 p-4 text-xs space-y-2">
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t("admin.activeWeddings")}</span>
                        <span className="font-semibold text-foreground">{plan.activeWeddings}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t("admin.guestPlaces")}</span>
                        <span className="font-semibold text-foreground">
                          {plan.limits.guestPlaces
                            ? t("admin.guestCount", { count: plan.limits.guestPlaces })
                            : t("admin.unlimited")}
                        </span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t("admin.mediaImages")}</span>
                        <span className="font-semibold text-foreground">
                          {plan.limits.mediaImages
                            ? t("admin.photoCount", { count: plan.limits.mediaImages })
                            : t("admin.unlimited")}
                        </span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t("admin.premiumTemplates")}</span>
                        <span className="font-semibold text-foreground">
                          {plan.limits.premiumTemplates ? t("admin.yes") : t("admin.no")}
                        </span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t("admin.brandingBadge")}</span>
                        <span className="font-semibold text-foreground">
                          {plan.limits.brandingBadge ? t("admin.badgeShown") : t("admin.badgeRemoved")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-border/50">
                    <Button
                      variant="outline"
                      className="w-full gap-2 text-xs"
                      onClick={() => setEditingPlan(plan)}
                    >
                      <Edit className="size-3.5" />
                      <span>{t("admin.editLimits")}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: ORDERS */}
      {activeTab === "orders" && (
        <section className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("admin.orderSearch")}
                value={orderSearch}
                onChange={(e) => {
                  setOrderSearch(e.target.value);
                  setOrderPage(1);
                }}
                className="pl-9 text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="size-4 text-muted-foreground" />
              <select
                value={orderStatus}
                onChange={(e) => {
                  setOrderStatus(e.target.value);
                  setOrderPage(1);
                }}
                className="rounded-md border border-input bg-background p-2 text-sm text-foreground"
              >
                <option value="">{t("admin.orderStatus.all")}</option>
                <option value="PENDING">{t("admin.orderStatus.PENDING")}</option>
                <option value="COMPLETED">{t("admin.orderStatus.COMPLETED")}</option>
                <option value="CANCELLED">{t("admin.orderStatus.CANCELLED")}</option>
                <option value="EXPIRED">{t("admin.orderStatus.EXPIRED")}</option>
              </select>
            </div>
          </div>

          {ordersQuery.isPending ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : ordersQuery.isError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
              {t("admin.ordersError")}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-left text-sm min-w-[750px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 px-4">{t("admin.col.code")}</th>
                    <th className="py-3 px-4">{t("admin.col.wedding")}</th>
                    <th className="py-3 px-4">{t("admin.col.plan")}</th>
                    <th className="py-3 px-4">{t("admin.col.amount")}</th>
                    <th className="py-3 px-4">{t("admin.col.status")}</th>
                    <th className="py-3 px-4">{t("admin.col.createdAt")}</th>
                    <th className="py-3 px-4 text-right">{t("admin.col.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersQuery.data.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        {t("admin.noOrders")}
                      </td>
                    </tr>
                  ) : (
                    ordersQuery.data.items.map((order: AdminPlanOrder) => (
                      <tr key={order.id} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="py-3 px-4 font-mono font-bold text-foreground">{order.code}</td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-foreground">{order.weddingTitle || t("admin.untitledWedding")}</div>
                          <div className="text-xs text-muted-foreground">{order.ownerEmail || t("admin.noEmail")}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-primary">{order.planCode}</span>
                        </td>
                        <td className="py-3 px-4 font-semibold">
                          {formatCurrency(order.amount, "vi")}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                              order.status === "COMPLETED"
                                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                                : order.status === "PENDING"
                                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {formatDate(order.createdAt, "vi", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {order.status === "PENDING" && (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-emerald-600 hover:text-emerald-700"
                                disabled={approveOrderMutation.isPending}
                                onClick={() =>
                                  approveOrderMutation.mutate({
                                    orderId: order.id,
                                    note: "Admin phê duyệt thủ công",
                                  })
                                }
                              >
                                {t("admin.approve")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-destructive hover:text-destructive/80"
                                disabled={cancelOrderMutation.isPending}
                                onClick={() =>
                                  cancelOrderMutation.mutate({
                                    orderId: order.id,
                                    note: "Admin hủy đơn",
                                  })
                                }
                              >
                                {t("admin.cancel")}
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              {ordersQuery.data.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border p-3 text-xs text-muted-foreground">
                  <div>
                    {t("admin.ordersPage", {
                      page: ordersQuery.data.page,
                      totalPages: ordersQuery.data.totalPages,
                      total: ordersQuery.data.totalCount,
                    })}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={orderPage <= 1}
                      onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                    >
                      {t("admin.prev")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={orderPage >= ordersQuery.data.totalPages}
                      onClick={() => setOrderPage((p) => p + 1)}
                    >
                      {t("admin.next")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: PAYMENTS */}
      {activeTab === "payments" && (
        <section className="space-y-4">
          {/* Filter Bar */}
          <div className="flex items-center gap-3">
            <Filter className="size-4 text-muted-foreground" />
            <select
              value={paymentStatus}
              onChange={(e) => {
                setPaymentStatus(e.target.value);
                setPaymentPage(1);
              }}
              className="rounded-md border border-input bg-background p-2 text-sm text-foreground"
            >
              <option value="">{t("admin.paymentStatus.all")}</option>
              <option value="MATCHED">{t("admin.paymentStatus.MATCHED")}</option>
              <option value="ACTIVATED">{t("admin.paymentStatus.ACTIVATED")}</option>
              <option value="UNMATCHED">{t("admin.paymentStatus.UNMATCHED")}</option>
            </select>
          </div>

          {paymentsQuery.isPending ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : paymentsQuery.isError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
              {t("admin.paymentsError")}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-left text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 px-4">SePay ID</th>
                    <th className="py-3 px-4">{t("admin.col.code")}</th>
                    <th className="py-3 px-4">{t("admin.col.amount")}</th>
                    <th className="py-3 px-4">{t("admin.col.receivingAccount")}</th>
                    <th className="py-3 px-4">{t("admin.col.content")}</th>
                    <th className="py-3 px-4">{t("admin.col.status")}</th>
                    <th className="py-3 px-4">{t("admin.col.time")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsQuery.data.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        {t("admin.noPayments")}
                      </td>
                    </tr>
                  ) : (
                    paymentsQuery.data.items.map((payment) => (
                      <tr key={payment.id} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="py-3 px-4 font-mono text-xs">{payment.providerTransactionId}</td>
                        <td className="py-3 px-4 font-mono font-bold text-foreground">
                          {payment.code || "—"}
                        </td>
                        <td className="py-3 px-4 font-semibold text-emerald-600">
                          {formatCurrency(payment.amount, "vi")}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">{payment.accountNumber}</td>
                        <td className="py-3 px-4 font-mono text-xs max-w-xs truncate">{payment.content}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                              payment.status === "MATCHED" || payment.status === "ACTIVATED"
                                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                                : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {payment.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {formatDate(payment.receivedAt, "vi", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              {paymentsQuery.data.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border p-3 text-xs text-muted-foreground">
                  <div>
                    {t("admin.paymentsPage", {
                      page: paymentsQuery.data.page,
                      totalPages: paymentsQuery.data.totalPages,
                      total: paymentsQuery.data.totalCount,
                    })}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={paymentPage <= 1}
                      onClick={() => setPaymentPage((p) => Math.max(1, p - 1))}
                    >
                      {t("admin.prev")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={paymentPage >= paymentsQuery.data.totalPages}
                      onClick={() => setPaymentPage((p) => p + 1)}
                    >
                      {t("admin.next")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* TAB 4: MANUAL GRANT */}
      {activeTab === "grant" && (
        <section className="max-w-xl rounded-3xl border border-border bg-card p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="font-serif text-xl font-normal text-foreground">
              {t("admin.grantTitle")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("admin.grantSubtitle")}
            </p>
          </div>

          {grantMessage && (
            <div
              className={`rounded-xl p-4 text-sm font-medium ${
                grantMessage.type === "success"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                  : "bg-destructive/15 text-destructive border border-destructive/30"
              }`}
            >
              {grantMessage.text}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Wedding ID (UUID)
              </label>
              <Input
                placeholder={t("admin.weddingIdPlaceholder")}
                value={grantWeddingId}
                onChange={(e) => setGrantWeddingId(e.target.value)}
                className="mt-1.5 font-mono text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("admin.grantPlan")}
              </label>
              <select
                value={grantPlanCode}
                onChange={(e) => setGrantPlanCode(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-input bg-background p-2.5 text-sm"
              >
                <option value="FREE">{t("admin.grantOption.FREE")}</option>
                <option value="BASIC">{t("admin.grantOption.BASIC")}</option>
                <option value="PREMIUM">{t("admin.grantOption.PREMIUM")}</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("admin.internalNote")}
              </label>
              <Input
                placeholder={t("admin.internalNotePlaceholder")}
                value={grantNote}
                onChange={(e) => setGrantNote(e.target.value)}
                className="mt-1.5 text-sm"
              />
            </div>

            <Button
              onClick={() => grantMutation.mutate()}
              disabled={grantMutation.isPending || !grantWeddingId.trim()}
              className="w-full rounded-full py-5 font-semibold gap-2"
            >
              {grantMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              <span>{t("admin.confirmGrant")}</span>
            </Button>
          </div>
        </section>
      )}

      {/* EDIT PLAN MODAL */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-serif text-xl font-semibold">{t("admin.editTitle", { code: editingPlan.code })}</h3>
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                aria-label={t("admin.close")}
              >
                <X className="size-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const name = (form.elements.namedItem("name") as HTMLInputElement).value;
                const price = Number((form.elements.namedItem("price") as HTMLInputElement).value);
                const status = (form.elements.namedItem("status") as HTMLSelectElement).value;

                updatePlanMutation.mutate({
                  code: editingPlan.code,
                  body: {
                    name,
                    price,
                    status,
                    limits: editingPlan.limits,
                  },
                });
              }}
              className="space-y-4 text-sm"
            >
              <div>
                <label className="font-medium text-xs text-muted-foreground uppercase">{t("admin.displayName")}</label>
                <Input name="name" defaultValue={editingPlan.name} required className="mt-1" />
              </div>

              <div>
                <label className="font-medium text-xs text-muted-foreground uppercase">{t("admin.price")}</label>
                <Input name="price" type="number" defaultValue={editingPlan.price} required className="mt-1 font-semibold" />
              </div>

              <div>
                <label className="font-medium text-xs text-muted-foreground uppercase">{t("admin.status")}</label>
                <select
                  name="status"
                  defaultValue={editingPlan.status}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
                >
                  <option value="ACTIVE">{t("admin.planStatus.ACTIVE")}</option>
                  <option value="INACTIVE">{t("admin.planStatus.INACTIVE")}</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button type="button" variant="outline" onClick={() => setEditingPlan(null)}>
                  {t("admin.cancel")}
                </Button>
                <Button type="submit" disabled={updatePlanMutation.isPending}>
                  {updatePlanMutation.isPending ? t("admin.saving") : t("admin.save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}