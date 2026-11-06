"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { PageHeader } from "@/shared/components/page-header";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { Button } from "@/shared/ui/button";
import { adminApi } from "../api/admin.api";

const requiredAdminGrants = ["ADMIN_RBAC_VIEW", "ADMIN_RBAC_MANAGE"];
export function AdminAccessControl() {
  const { t } = useTranslation("admin");
  const { api } = useRuntime();
  const client = useQueryClient();
  const [draftPermissions, setDraftPermissions] = useState<string[] | null>(null);
  const [notice, setNotice] = useState("");
  const access = useQuery({
    queryKey: ["admin-access-control"],
    queryFn: ({ signal }) => adminApi.accessControl(api, signal),
  });
  const permissions = useQuery({
    queryKey: ["admin-my-permissions"],
    queryFn: ({ signal }) => adminApi.myPermissions(api, signal),
  });
  const canManageRbac = permissions.data?.includes("ADMIN_RBAC_MANAGE") ?? false;
  const adminRole = useMemo(
    () => access.data?.roles.find((role) => role.code === "ADMIN"),
    [access.data],
  );
  const selected = draftPermissions ?? adminRole?.permissions ?? [];
  const update = useMutation({
    mutationFn: () => adminApi.updateRolePermissions(api, "ADMIN", selected),
    onSuccess: async (result) => {
      setNotice(t("permissionsSaved"));
      setDraftPermissions(result.roles.find((role) => role.code === "ADMIN")?.permissions ?? []);
      await client.invalidateQueries({ queryKey: ["admin-access-control"] });
    },
    onError: (reason) =>
      setNotice(reason instanceof Error ? reason.message : t("permissionsSaveFailed")),
  });
  if (access.isPending) return <LoadingState label={t("loadingAccessControl")} />;
  if (access.isError || !access.data)
    return <ErrorState error={access.error} retry={() => void access.refetch()} />;
  function toggle(code: string, checked: boolean) {
    setDraftPermissions((current) => {
      const values = current ?? adminRole?.permissions ?? [];
      return checked ? [...new Set([...values, code])] : values.filter((value) => value !== code);
    });
    setNotice("");
  }
  return (
    <div className="space-y-6">
      <PageHeader title={t("accessControlTitle")} description={t("accessControlDescription")} />
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("adminPermissionSet")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("adminPermissionSetHelp")}</p>
          </div>
          <Button
            disabled={
              !canManageRbac ||
              update.isPending ||
              requiredAdminGrants.some((grant) => !selected.includes(grant))
            }
            onClick={() => update.mutate()}
          >
            {update.isPending ? t("savingPermissions") : t("savePermissions")}
          </Button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {access.data.permissions
            .filter((permission) => permission.scope === "PLATFORM")
            .map((permission) => (
              <label key={permission.code} className="flex items-start gap-3 rounded-xl border p-4">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={selected.includes(permission.code)}
                  disabled={
                    !canManageRbac ||
                    requiredAdminGrants.includes(permission.code) ||
                    update.isPending
                  }
                  onChange={(e) => toggle(permission.code, e.target.checked)}
                />
                <span>
                  <span className="font-medium">
                    {t(`accessPermissionNames.${permission.code}`, {
                      defaultValue: permission.name,
                    })}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {permission.code}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {t(`accessPermissionDescriptions.${permission.code}`, {
                      defaultValue: permission.description ?? "",
                    })}
                  </span>
                </span>
              </label>
            ))}
        </div>
        {notice && (
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        {!canManageRbac && (
          <p className="mt-4 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
            {t("rbacReadOnly")}
          </p>
        )}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        {access.data.roles
          .filter((role) => role.code !== "ADMIN")
          .map((role) => (
            <article key={role.code} className="rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  {t(`accessRoles.${role.code}.name`, { defaultValue: role.name })}
                </h2>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  {t(`accessScopes.${role.scope}`, { defaultValue: role.scope })}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t(`accessRoles.${role.code}.description`, { defaultValue: role.description })}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {role.permissions.length ? (
                  role.permissions.map((permission) => (
                    <span key={permission} className="rounded-full border px-2.5 py-1 text-xs">
                      {permission}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">{t("guestTokenRoleNote")}</span>
                )}
              </div>
              {role.code === "CO_HOST" && (
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  {t("coHostScopeNote")}
                </p>
              )}
            </article>
          ))}
      </section>
    </div>
  );
}
