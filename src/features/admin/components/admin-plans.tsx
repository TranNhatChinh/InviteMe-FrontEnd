"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Edit, Filter, Gift, Loader2, Package, Receipt, Search, X } from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import { ApiError } from "@/core/api/api-error";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { formatCurrency, formatDate } from "@/i18n/format";
import { adminApi, type AdminPlan, type AdminPlanOrder, type PlanLimits } from "../api/admin.api";

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
  const [grantWeddingSearch, setGrantWeddingSearch] = useState("");
  const [grantWeddingPage, setGrantWeddingPage] = useState(1);
  const [selectedGrantWedding, setSelectedGrantWedding] = useState<{
    id: string;
    title: string;
    slug: string;
    ownerEmail: string;
    status: string;
  } | null>(null);
  const [grantPlanCode, setGrantPlanCode] = useState("");
  const [grantNote, setGrantNote] = useState("");
  const [grantMessage, setGrantMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Queries
  const plansQuery = useQuery({
    queryKey: ["admin-plans"],
    queryFn: ({ signal }) => adminApi.plans(api, signal),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
    refetchOnWindowFocus: false,
  });

  const activeAdminPlans =
    plansQuery.data?.filter((plan) => plan.status.toUpperCase() === "ACTIVE") ?? [];
  const needsPublicPlanFallback =
    activeTab === "grant" &&
    (plansQuery.isError || (plansQuery.isSuccess && activeAdminPlans.length === 0));
  const publicPlansQuery = useQuery({
    queryKey: ["public-plans-for-admin-grant"],
    queryFn: ({ signal }) => adminApi.publicPlansForGrant(api, signal),
    enabled: needsPublicPlanFallback,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
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
    enabled: activeTab === "orders",
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
    refetchOnWindowFocus: false,
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
    enabled: activeTab === "payments",
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
    refetchOnWindowFocus: false,
  });

  const grantWeddingsQuery = useQuery({
    queryKey: ["admin-plan-grant-weddings", grantWeddingSearch, grantWeddingPage],
    queryFn: ({ signal }) =>
      adminApi.weddings(
        api,
        {
          page: grantWeddingPage,
          pageSize: 10,
          search: grantWeddingSearch.trim() || undefined,
        },
        signal,
      ),
    enabled: activeTab === "grant",
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const isGrantWeddingIdValid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(grantWeddingId.trim());
  const grantPlanSource = activeAdminPlans.length ? activeAdminPlans : publicPlansQuery.data;
  const grantPlanOptions = grantPlanSource?.length
    ? grantPlanSource.map((plan) => ({
        code: plan.code,
        name: plan.name,
        details: `${plan.price === 0 ? t("admin.free") : formatCurrency(plan.price, "vi")}${
          "status" in plan ? ` · ${plan.status}` : ""
        }`,
      }))
    : [];
  const selectedGrantPlan = grantPlanOptions.find((plan) => plan.code === grantPlanCode);
  const grantPlanFallbackVisible =
    !plansQuery.isPending &&
    !publicPlansQuery.isPending &&
    (!activeAdminPlans.length || plansQuery.isError);
  const hasPublicPlanFallback = !activeAdminPlans.length && Boolean(publicPlansQuery.data?.length);
  const planCatalogError = publicPlansQuery.error ?? plansQuery.error;
  const planCatalogErrorText =
    planCatalogError instanceof ApiError
      ? planCatalogError.code === "forbidden"
        ? t("admin.grantForbidden")
        : planCatalogError.code === "unauthenticated"
          ? t("admin.planCatalogLoginRequired")
          : planCatalogError.code === "network" || planCatalogError.code === "configuration"
            ? t("admin.planCatalogConnectionError")
            : t("admin.planCatalogApiError")
      : t("admin.planCatalogApiError");

  // Mutations
  const updatePlanMutation = useMutation({
    mutationFn: (vars: {
      code: string;
      body: { name: string; price: number; status: string; limits: PlanLimits };
    }) => adminApi.updatePlan(api, vars.code, vars.body),
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
    mutationFn: (input: {
      weddingId: string;
      weddingTitle: string;
      planCode: string;
      note?: string;
    }) =>
      adminApi.grantWeddingPlan(api, input.weddingId, {
        planCode: input.planCode,
        note: input.note,
      }),
    onSuccess: (result, input) => {
      setGrantMessage({
        type: "success",
        text: t("admin.grantSuccess", {
          plan: result.planName,
          wedding: input.weddingTitle,
        }),
      });
      setGrantWeddingId("");
      setSelectedGrantWedding(null);
      setGrantNote("");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-plans"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-weddings"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-plan-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["wedding-plan", result.weddingId] }),
      ]);
    },
    onError: (err: unknown) => {
      let message = t("admin.grantError");
      if (err instanceof ApiError) {
        if (err.code === "forbidden") message = t("admin.grantForbidden");
        else if (err.backendCode === "WEDDING_NOT_FOUND") message = t("admin.grantWeddingNotFound");
        else if (err.backendCode === "PLAN_NOT_FOUND") message = t("admin.grantPlanNotFound");
        else if (err.status === 400) message = t("admin.grantInvalidInput");
      }
      setGrantMessage({ type: "error", text: message });
    },
  });

  function selectGrantWedding(wedding: NonNullable<typeof selectedGrantWedding>) {
    setSelectedGrantWedding(wedding);
    setGrantWeddingId(wedding.id);
    setGrantMessage(null);
  }

  function submitGrant() {
    if (!isGrantWeddingIdValid || !grantPlanCode || grantMutation.isPending) return;
    const confirmed = window.confirm(
      t("admin.grantConfirmWarning", {
        wedding: selectedGrantWedding?.title ?? grantWeddingId,
        plan: selectedGrantPlan?.name ?? grantPlanCode,
      }),
    );
    if (confirmed)
      grantMutation.mutate({
        weddingId: grantWeddingId.trim(),
        weddingTitle: selectedGrantWedding?.title ?? grantWeddingId.trim(),
        planCode: grantPlanCode,
        note: grantNote.trim() || undefined,
      });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground font-serif">
          {t("admin.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("admin.subtitle")}</p>
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
                      <h2 className="font-serif text-xl font-normal text-foreground">
                        {plan.name}
                      </h2>
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
                          {plan.limits.brandingBadge
                            ? t("admin.badgeShown")
                            : t("admin.badgeRemoved")}
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
                        <td className="py-3 px-4 font-mono font-bold text-foreground">
                          {order.code}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-foreground">
                            {order.weddingTitle || t("admin.untitledWedding")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {order.ownerEmail || t("admin.noEmail")}
                          </div>
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
                          {formatDate(order.createdAt, "vi", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
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
                        <td className="py-3 px-4 font-mono text-xs">
                          {payment.providerTransactionId}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-foreground">
                          {payment.code || "—"}
                        </td>
                        <td className="py-3 px-4 font-semibold text-emerald-600">
                          {formatCurrency(payment.amount, "vi")}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">{payment.accountNumber}</td>
                        <td className="py-3 px-4 font-mono text-xs max-w-xs truncate">
                          {payment.content}
                        </td>
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
                          {formatDate(payment.receivedAt, "vi", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
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
        <div className="space-y-5">
          <div>
            <h2 className="font-serif text-xl font-normal text-foreground">
              {t("admin.grantTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("admin.grantSubtitle")}</p>
          </div>

          {grantMessage && (
            <div
              role={grantMessage.type === "error" ? "alert" : "status"}
              className={`rounded-xl border p-4 text-sm font-medium ${
                grantMessage.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {grantMessage.text}
            </div>
          )}

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
            <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div>
                <h3 className="font-medium">{t("admin.chooseWedding")}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("admin.chooseWeddingDescription")}
                </p>
              </div>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input
                  value={grantWeddingSearch}
                  disabled={grantMutation.isPending}
                  onChange={(event) => {
                    setGrantWeddingSearch(event.target.value);
                    setGrantWeddingPage(1);
                  }}
                  placeholder={t("admin.weddingSearchPlaceholder")}
                  className="pl-9"
                  maxLength={100}
                />
              </label>

              {grantWeddingsQuery.isPending ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-primary" />
                </div>
              ) : grantWeddingsQuery.isError ? (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                  <p>{t("admin.weddingsForGrantError")}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => void grantWeddingsQuery.refetch()}
                  >
                    {t("admin.retry")}
                  </Button>
                </div>
              ) : grantWeddingsQuery.data.items.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {t("admin.noWeddingsForGrant")}
                </p>
              ) : (
                <>
                  <div className="max-h-[440px] space-y-2 overflow-y-auto pr-1">
                    {grantWeddingsQuery.data.items.map((wedding) => {
                      const selected = grantWeddingId === wedding.id;
                      return (
                        <button
                          key={wedding.id}
                          type="button"
                          aria-pressed={selected}
                          disabled={grantMutation.isPending}
                          onClick={() => selectGrantWedding(wedding)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors ${
                            selected
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/40 hover:bg-muted/30"
                          }`}
                        >
                          <span className="flex flex-wrap items-start justify-between gap-2">
                            <span className="font-medium">{wedding.title}</span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              {wedding.status}
                            </span>
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            /{wedding.slug} · {wedding.ownerEmail}
                          </span>
                          <span className="mt-1 block break-all font-mono text-[11px] text-muted-foreground">
                            {wedding.id}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {grantWeddingsQuery.data.totalPages > 1 && (
                    <div className="flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                      <span>
                        {t("admin.weddingsPage", {
                          page: grantWeddingsQuery.data.page,
                          totalPages: grantWeddingsQuery.data.totalPages,
                          total: grantWeddingsQuery.data.totalCount,
                        })}
                      </span>
                      <span className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={grantWeddingPage <= 1 || grantWeddingsQuery.isFetching}
                          onClick={() => setGrantWeddingPage((page) => page - 1)}
                        >
                          {t("admin.prev")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            grantWeddingPage >= grantWeddingsQuery.data.totalPages ||
                            grantWeddingsQuery.isFetching
                          }
                          onClick={() => setGrantWeddingPage((page) => page + 1)}
                        >
                          {t("admin.next")}
                        </Button>
                      </span>
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
              {selectedGrantWedding ? (
                <div className="rounded-xl bg-primary/10 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{selectedGrantWedding.title}</p>
                    <button
                      type="button"
                      disabled={grantMutation.isPending}
                      className="text-xs font-medium text-primary-hover underline underline-offset-4"
                      onClick={() => {
                        setSelectedGrantWedding(null);
                        setGrantWeddingId("");
                      }}
                    >
                      {t("admin.enterWeddingId")}
                    </button>
                  </div>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {selectedGrantWedding.id}
                  </p>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("admin.weddingIdLabel")}
                  </label>
                  <Input
                    placeholder={t("admin.weddingIdPlaceholder")}
                    value={grantWeddingId}
                    onChange={(event) => {
                      setGrantWeddingId(event.target.value);
                      setSelectedGrantWedding(null);
                      setGrantMessage(null);
                    }}
                    className="mt-1.5 font-mono text-sm"
                    disabled={grantMutation.isPending}
                    aria-invalid={Boolean(grantWeddingId.trim()) && !isGrantWeddingIdValid}
                  />
                  <p
                    className={`mt-1 text-xs ${
                      grantWeddingId.trim() && !isGrantWeddingIdValid
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {grantWeddingId.trim() && !isGrantWeddingIdValid
                      ? t("admin.invalidWeddingId")
                      : t("admin.weddingIdHint")}
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("admin.grantPlan")}
                </label>
                <div
                  role="radiogroup"
                  aria-label={t("admin.grantPlan")}
                  className="mt-2 grid gap-2 sm:grid-cols-2"
                >
                  {grantPlanOptions.map((plan) => {
                    const selected = grantPlanCode === plan.code;
                    return (
                      <label
                        key={plan.code}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/40 hover:bg-muted/30"
                        } ${grantMutation.isPending ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        <input
                          type="radio"
                          name="grantPlanCode"
                          value={plan.code}
                          checked={selected}
                          disabled={grantMutation.isPending}
                          onChange={() => setGrantPlanCode(plan.code)}
                          className="mt-1 size-4 shrink-0 accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{plan.name}</span>
                          <span className="mt-1 block break-words text-xs text-muted-foreground">
                            {plan.code}
                            {plan.details ? ` · ${plan.details}` : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {(plansQuery.isPending ||
                  (needsPublicPlanFallback && publicPlansQuery.isPending)) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("admin.loadingGrantPlans")}
                  </p>
                )}
                {grantPlanFallbackVisible && (
                  <div
                    className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"
                    role={plansQuery.isError ? "alert" : "status"}
                  >
                    <span>
                      {publicPlansQuery.isSuccess && !publicPlansQuery.data.length
                        ? t("admin.noActivePlans")
                        : hasPublicPlanFallback
                          ? t("admin.publicPlanCatalogFallback")
                          : plansQuery.isError || publicPlansQuery.isError
                            ? planCatalogErrorText
                            : t("admin.noActivePlans")}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void plansQuery.refetch();
                        if (needsPublicPlanFallback) void publicPlansQuery.refetch();
                      }}
                    >
                      {t("admin.retry")}
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("admin.internalNote")}
                </label>
                <Input
                  placeholder={t("admin.internalNotePlaceholder")}
                  value={grantNote}
                  maxLength={500}
                  disabled={grantMutation.isPending}
                  onChange={(event) => setGrantNote(event.target.value)}
                  className="mt-1.5 text-sm"
                />
              </div>

              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                {t("admin.grantReplaceNotice")}
              </p>

              <Button
                type="button"
                onClick={submitGrant}
                disabled={grantMutation.isPending || !isGrantWeddingIdValid || !grantPlanCode}
                className="w-full gap-2 rounded-full py-5 font-semibold"
              >
                {grantMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                <span>{t("admin.confirmGrant")}</span>
              </Button>

              {!selectedGrantWedding && (
                <p className="text-xs text-muted-foreground">{t("admin.manualWeddingIdHint")}</p>
              )}
            </section>
          </div>
        </div>
      )}

      {/* EDIT PLAN MODAL */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-serif text-xl font-semibold">
                {t("admin.editTitle", { code: editingPlan.code })}
              </h3>
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
                <label className="font-medium text-xs text-muted-foreground uppercase">
                  {t("admin.displayName")}
                </label>
                <Input name="name" defaultValue={editingPlan.name} required className="mt-1" />
              </div>

              <div>
                <label className="font-medium text-xs text-muted-foreground uppercase">
                  {t("admin.price")}
                </label>
                <Input
                  name="price"
                  type="number"
                  defaultValue={editingPlan.price}
                  required
                  className="mt-1 font-semibold"
                />
              </div>

              <div>
                <label className="font-medium text-xs text-muted-foreground uppercase">
                  {t("admin.status")}
                </label>
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
