"use client";

import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { PageHeader } from "@/shared/components/page-header";
import { EmptyState } from "@/shared/feedback/empty-state";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { adminApi } from "../api/admin.api";
import { useLocale } from "@/i18n/language-context";
import { formatDate, formatNumber } from "@/i18n/format";

export function AdminUsers() {
  const { t } = useTranslation("admin");
  const { language } = useLocale();
  const { api } = useRuntime();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const users = useQuery({
    queryKey: ["admin-users", page, search, status, role],
    queryFn: ({ signal }) =>
      adminApi.users(api, { page, pageSize: 20, search, status, role }, signal),
  });
  const permissions = useQuery({
    queryKey: ["admin-my-permissions"],
    queryFn: ({ signal }) => adminApi.myPermissions(api, signal),
  });
  const canManageUsers = permissions.data?.includes("ADMIN_USERS_MANAGE") ?? false;
  const selectedUser = useQuery({
    queryKey: ["admin-user-detail", selectedUserId],
    queryFn: ({ signal }) => {
      if (!selectedUserId) throw new Error("Select an account before loading its details.");
      return adminApi.userDetail(api, selectedUserId, signal);
    },
    enabled: Boolean(selectedUserId),
  });
  const changed = async () => {
    setError("");
    await client.invalidateQueries({ queryKey: ["admin-users"] });
    await client.invalidateQueries({ queryKey: ["admin-dashboard"] });
  };
  const statusMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: "ACTIVE" | "SUSPENDED" }) =>
      adminApi.setUserStatus(api, id, value),
    onSuccess: changed,
    onError: () => setError(t("updateStatusFailed")),
  });
  const roleMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: "ADMIN" | "USER" }) =>
      adminApi.setUserRole(api, id, value),
    onSuccess: changed,
    onError: () => setError(t("updateRoleFailed")),
  });
  function apply(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }
  return (
    <>
      <div className="space-y-6">
        <PageHeader title={t("accounts")} description={t("accountManagementDescription")} />
        <form
          onSubmit={apply}
          className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_180px_180px_auto_auto] sm:items-end"
        >
          <label className="grid gap-1 text-sm">
            {t("userSearchLabel")}
            <Input
              value={searchDraft}
              maxLength={100}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={t("emailOrName")}
            />
          </label>
          <label className="grid gap-1 text-sm">
            {t("status")}
            <select
              className="h-10 rounded-lg border bg-background px-3"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t("allStatuses")}</option>
              <option value="ACTIVE">{t("activeStatus")}</option>
              <option value="SUSPENDED">{t("suspendedStatus")}</option>
              <option value="DISABLED">{t("deletedStatus")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            {t("platformRole")}
            <select
              className="h-10 rounded-lg border bg-background px-3"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t("allRoles")}</option>
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>
          <Button type="submit">{t("search")}</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearchDraft("");
              setSearch("");
              setStatus("");
              setRole("");
              setPage(1);
            }}
          >
            {t("reset")}
          </Button>
        </form>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-card p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {users.isPending && <LoadingState label={t("loadingAccounts")} />}
        {users.isError && <ErrorState error={users.error} retry={() => void users.refetch()} />}
        {users.data &&
          (users.data.items.length === 0 ? (
            <EmptyState title={t("noAccounts")} description={t("changeFilters")} />
          ) : (
            <>
              <div className="overflow-x-auto rounded-2xl border bg-card">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      {[t("account"), t("role"), t("status"), t("created"), t("actions")].map(
                        (x) => (
                          <th key={x} className="px-4 py-3 font-medium">
                            {x}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {users.data.items.map((user) => {
                      const protectedAdmin = user.role === "ADMIN";
                      return (
                        <tr key={user.id}>
                          <td className="px-4 py-4">
                            <p className="font-medium">{user.fullName || t("unnamedAccount")}</p>
                            <p className="text-muted-foreground">{user.email}</p>
                          </td>
                          <td className="px-4 py-4">
                            {canManageUsers ? (
                              <select
                                aria-label={t("roleForAccount", {
                                  email: user.email,
                                  protected: protectedAdmin ? ` (${t("protected")})` : "",
                                })}
                                title={protectedAdmin ? t("protectedHint") : undefined}
                                className="h-9 rounded-lg border bg-background px-2"
                                value={user.role}
                                disabled={
                                  protectedAdmin ||
                                  roleMutation.isPending ||
                                  user.status !== "ACTIVE"
                                }
                                onChange={(e) =>
                                  window.confirm(
                                    t("confirmRoleChange", {
                                      email: user.email,
                                      role: e.target.value,
                                    }),
                                  ) &&
                                  roleMutation.mutate({
                                    id: user.id,
                                    value: e.target.value as "ADMIN" | "USER",
                                  })
                                }
                              >
                                <option value="USER">USER</option>
                                <option value="ADMIN">ADMIN</option>
                              </select>
                            ) : (
                              <span className="text-sm text-muted-foreground">{user.role}</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${user.status === "ACTIVE" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                            >
                              {t(
                                user.status === "DISABLED"
                                  ? "deletedStatus"
                                  : `${user.status.toLowerCase()}Status`,
                                { defaultValue: user.status },
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-muted-foreground">
                            {formatDate(user.createdAt, language, { dateStyle: "medium" })}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedUserId(user.id)}
                              >
                                {t("details")}
                              </Button>
                              {canManageUsers && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    protectedAdmin ||
                                    statusMutation.isPending ||
                                    user.status === "DISABLED"
                                  }
                                  title={protectedAdmin ? t("protectedHint") : undefined}
                                  onClick={() =>
                                    window.confirm(
                                      t(
                                        user.status === "ACTIVE"
                                          ? "confirmSuspend"
                                          : "confirmReactivate",
                                        { email: user.email },
                                      ),
                                    ) &&
                                    statusMutation.mutate({
                                      id: user.id,
                                      value: user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
                                    })
                                  }
                                >
                                  {protectedAdmin
                                    ? t("protected")
                                    : user.status === "ACTIVE"
                                      ? t("suspend")
                                      : user.status === "SUSPENDED"
                                        ? t("reactivate")
                                        : t("unavailable")}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {t("accountCount", {
                    count: formatNumber(users.data.totalCount, language),
                    page: formatNumber(users.data.page, language),
                  })}
                  {Math.max(users.data.totalPages, 1)}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={page <= 1 || users.isFetching}
                    onClick={() => setPage((x) => x - 1)}
                  >
                    {t("previous", { ns: "common" })}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={page >= users.data.totalPages || users.isFetching}
                    onClick={() => setPage((x) => x + 1)}
                  >
                    {t("next", { ns: "common" })}
                  </Button>
                </div>
              </div>
            </>
          ))}
      </div>
      <Modal
        open={Boolean(selectedUserId)}
        onClose={() => setSelectedUserId(null)}
        title={t("accountDetailTitle")}
        description={t("accountDetailDescription")}
      >
        {selectedUser.isPending && <LoadingState label={t("loadingAccountDetail")} />}
        {selectedUser.isError && (
          <ErrorState error={selectedUser.error} retry={() => void selectedUser.refetch()} />
        )}
        {selectedUser.data && (
          <div className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="text-xs text-muted-foreground">{t("account")}</p>
                <p className="mt-1 font-medium">
                  {selectedUser.data.account.fullName || t("unnamedAccount")}
                </p>
                <p className="text-sm text-muted-foreground">{selectedUser.data.account.email}</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="text-xs text-muted-foreground">{t("status")}</p>
                <p className="mt-1 font-medium">
                  {t(
                    selectedUser.data.account.status === "DISABLED"
                      ? "deletedStatus"
                      : `${selectedUser.data.account.status.toLowerCase()}Status`,
                    { defaultValue: selectedUser.data.account.status },
                  )}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("role")}: {selectedUser.data.account.role}
                </p>
              </div>
            </section>
            <section>
              <h3 className="font-semibold">
                {t("ownedWeddings", {
                  count: formatNumber(selectedUser.data.weddingCount, language),
                })}
              </h3>
              {selectedUser.data.recentWeddings.length ? (
                <ul className="mt-3 divide-y rounded-xl border">
                  {selectedUser.data.recentWeddings.map((wedding) => (
                    <li
                      key={wedding.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3"
                    >
                      <div>
                        <p className="font-medium">{wedding.title}</p>
                        <p className="text-xs text-muted-foreground">/{wedding.slug}</p>
                      </div>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
                        {t(`${wedding.status.toLowerCase()}Status`, {
                          defaultValue: wedding.status,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">{t("accountHasNoWeddings")}</p>
              )}
            </section>
            <p className="text-xs text-muted-foreground">
              {t("accountCreated", {
                date: formatDate(selectedUser.data.account.createdAt, language, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              })}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
