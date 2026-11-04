"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, UserPlus } from "lucide-react";
import { z } from "zod";
import { useRuntime } from "@/core/config/runtime";
import { ApiError } from "@/core/api/api-error";
import { usePermission } from "@/shared/components/permission-guard";
import { PageHeader } from "@/shared/components/page-header";
import { ConfirmDialog } from "@/shared/feedback/confirm-dialog";
import { EmptyState } from "@/shared/feedback/empty-state";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { Input } from "@/shared/ui/input";
import { FormField } from "@/shared/forms/form-field";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  coHostKeys,
  createCoHostInvitation,
  isWeddingWideOnly,
  listCoHostInvitations,
  listCoHosts,
  listPlanningGroups,
  revokeCoHost,
  revokeCoHostInvitation,
  updateCoHostScopes,
  type CoHost,
  type PermissionScope,
} from "../api/co-host.api";
import { ScopeEditor } from "./scope-editor";
import { PERMISSION_AREAS, PERMISSION_LABELS } from "../utils/scopes";
import { useLocale } from "@/i18n/language-context";
import { formatDate, formatNumber } from "@/i18n/format";
// eslint-disable-next-line architecture/boundaries -- Wedding plan entitlements are shared by all wedding workspace features.
import { FeatureLimitNotice, planEntitlementState, useWeddingPlan } from "@/features/plans";

type InviteInput = { email: string };

function friendlyError(
  error: unknown,
  action: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!(error instanceof ApiError)) return t("errors.actionFailed", { action });
  if (error.code === "network") return t("errors.network");
  if (error.backendCode === "PLAN_LIMIT_REACHED") return t("errors.planLimit");
  if (error.backendCode === "OWNER_ONLY") return t("errors.ownerOnly");
  if (error.status === 403) return t("errors.forbidden");
  if (error.status === 409) return t("errors.conflict");
  if (error.status === 422 || error.status === 400) return t("errors.invalidScopes");
  if (error.status === 404) return t("errors.notFound");
  return t("errors.actionFailedLater", { action });
}

function scopeDescription(
  grant: PermissionScope,
  names: Map<string, string>,
  t: (key: string) => string,
) {
  if (isWeddingWideOnly(grant.permission) && !grant.weddingWide) {
    return t("legacyScope");
  }
  return grant.weddingWide
    ? t("wholeWedding")
    : grant.groupIds.map((id) => names.get(id) ?? t("deletedGroup")).join(", ");
}

export function CoHostManagement({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("cohost");
  const { t: tPlans } = useTranslation("plans");
  const { language } = useLocale();
  const { api } = useRuntime();
  const { isOwner } = usePermission();
  const plan = useWeddingPlan(weddingId, isOwner);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const inviteSchema = useMemo(
    () =>
      z.object({
        email: z
          .string()
          .trim()
          .pipe(z.email(t("validation.emailInvalid")).max(256, t("validation.emailMax"))),
      }),
    [t],
  );
  const form = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "" },
  });

  const members = useQuery({
    queryKey: coHostKeys.members(weddingId),
    queryFn: ({ signal }) => listCoHosts(api, weddingId, signal),
    enabled: isOwner,
  });
  const invitations = useQuery({
    queryKey: coHostKeys.invitations(weddingId),
    queryFn: ({ signal }) => listCoHostInvitations(api, weddingId, signal),
    enabled: isOwner,
  });
  const groups = useQuery({
    queryKey: coHostKeys.groups(weddingId),
    queryFn: ({ signal }) => listPlanningGroups(api, weddingId, signal),
    enabled: isOwner,
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: coHostKeys.members(weddingId) }),
      queryClient.invalidateQueries({ queryKey: coHostKeys.invitations(weddingId) }),
    ]);
  }

  const invite = useMutation({
    mutationFn: ({ email, grants }: { email: string; grants: PermissionScope[] }) =>
      createCoHostInvitation(api, weddingId, email, grants),
    onSuccess: async (result) => {
      form.reset();
      setNotice(
        result.status === "SENT"
          ? t("inviteSent", { email: result.email })
          : t("inviteQueuedButEmailFailed", { email: result.email }),
      );
      setActionError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: coHostKeys.invitations(weddingId) }),
        queryClient.invalidateQueries({ queryKey: ["wedding-plan", weddingId] }),
      ]);
    },
    onError: async (error) => {
      setActionError(friendlyError(error, t("actions.sendInvite"), t));
      if (error instanceof ApiError && error.backendCode === "PLAN_LIMIT_REACHED")
        await queryClient.invalidateQueries({ queryKey: ["wedding-plan", weddingId] });
    },
  });
  const revokeInvitation = useMutation({
    mutationFn: (id: string) => revokeCoHostInvitation(api, weddingId, id),
    onSuccess: refresh,
    onError: (error) => setActionError(friendlyError(error, t("actions.revokeInvite"), t)),
  });
  const saveScopes = useMutation({
    mutationFn: ({ userId, grants }: { userId: string; grants: PermissionScope[] }) =>
      updateCoHostScopes(api, weddingId, userId, grants),
    onSuccess: async () => {
      setEditing(null);
      setNotice(t("scopesUpdated"));
      setActionError("");
      await queryClient.invalidateQueries({ queryKey: coHostKeys.members(weddingId) });
    },
    onError: (error) => setActionError(friendlyError(error, t("actions.updatePermissions"), t)),
  });
  const revokeMember = useMutation({
    mutationFn: (userId: string) => revokeCoHost(api, weddingId, userId),
    onSuccess: async () => {
      setEditing(null);
      setNotice(t("accessRevoked"));
      setActionError("");
      await refresh();
    },
    onError: (error) => setActionError(friendlyError(error, t("actions.revokeCoHost"), t)),
  });

  if (!isOwner)
    return <EmptyState title={t("ownerOnlyTitle")} description={t("ownerOnlyDescription")} />;
  if (members.isPending || invitations.isPending || groups.isPending)
    return <LoadingState label={t("loadingMembers")} />;
  if (members.isError)
    return <ErrorState error={members.error} retry={() => void members.refetch()} />;
  if (invitations.isError)
    return <ErrorState error={invitations.error} retry={() => void invitations.refetch()} />;
  if (groups.isError)
    return <ErrorState error={groups.error} retry={() => void groups.refetch()} />;

  const groupNames = new Map(groups.data.map((group) => [group.id, group.name]));
  const activeMembers = members.data.filter((member) => member.status === "ACTIVE");
  const openInvitations = invitations.data.filter((invitation) =>
    ["PENDING", "SENT"].includes(invitation.status),
  );
  const planUnavailable = plan.isError || (!plan.isPending && !plan.data);
  const coHostGate =
    !planUnavailable && plan.data ? planEntitlementState(plan.data, "coHosts") : null;
  const invitationAvailable = Boolean(
    !planUnavailable && !plan.isPending && plan.data && coHostGate && !coHostGate.locked,
  );
  const quotaLimit = !planUnavailable ? plan.data?.limits.coHosts : undefined;
  const quotaLimitLabel =
    plan.data?.legacy || quotaLimit === null
      ? t("unlimited")
      : quotaLimit === undefined
        ? "—"
        : formatNumber(quotaLimit, language);
  const packageStatusText = planUnavailable
    ? t("planUnknown")
    : plan.isPending
      ? t("planChecking")
      : plan.data
        ? t("quotaSummary", {
            used: formatNumber(plan.data.usage.coHosts, language),
            limit: quotaLimitLabel,
            plan: plan.data.planName,
          })
        : t("planUnknown");

  function scrollToInviteForm() {
    document
      .getElementById("co-host-invitation")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <section className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {t("summaryLine", {
              members: formatNumber(activeMembers.length, language),
              invites: formatNumber(openInvitations.length, language),
            })}
          </p>
          <p id="co-host-package-status" className="mt-1 text-sm text-muted-foreground">
            {packageStatusText}
          </p>
        </div>
        {plan.data && !planUnavailable && (
          <span className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-petal/70 px-3 text-sm font-medium text-primary-hover">
            {formatNumber(plan.data.usage.coHosts, language)} / {quotaLimitLabel}
          </span>
        )}
      </section>
      {notice && (
        <p role="status" className="rounded-lg bg-success/10 px-4 py-3 text-sm text-foreground">
          {notice}
        </p>
      )}
      {actionError && (
        <p role="alert" className="rounded-lg bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {actionError}
        </p>
      )}
      {coHostGate?.locked && (
        <FeatureLimitNotice
          title={t(
            coHostGate.reason === "limit-reached" ? "gate.limitTitle" : "gate.unsupportedTitle",
          )}
          description={t(
            coHostGate.reason === "limit-reached"
              ? "gate.limitDescription"
              : "gate.unsupportedDescription",
          )}
          usage={coHostGate.reason === "limit-reached" ? packageStatusText : undefined}
          variant="compact"
          upgradeHref={`/weddings/${encodeURIComponent(weddingId)}/plan`}
          upgradeLabel={tPlans("gate.viewPlans")}
        />
      )}
      {planUnavailable && (
        <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/25 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className="text-sm text-muted-foreground">
            {t("errors.planUnavailable")}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void plan.refetch()}>
            <RefreshCw aria-hidden="true" /> {t("refresh")}
          </Button>
        </div>
      )}
      {plan.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("planChecking")}
        </p>
      )}

      <div
        className={`grid gap-8 ${invitationAvailable ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start" : "grid-cols-1"}`}
      >
        <div className="space-y-8">
          <section aria-labelledby="co-host-members" className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="co-host-members" className="text-lg font-semibold">
                {t("activeMembers")}{" "}
                <span className="font-normal text-muted-foreground">
                  {formatNumber(activeMembers.length, language)}
                </span>
              </h2>
              <Button
                type="button"
                className="min-h-10 w-full rounded-xl sm:w-auto"
                disabled={!invitationAvailable}
                aria-describedby="co-host-package-status"
                onClick={scrollToInviteForm}
              >
                <UserPlus aria-hidden="true" /> {t("inviteButton")}
              </Button>
            </div>
            {activeMembers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-6 text-sm text-muted-foreground">
                {t("noCoHostsDescription")}
              </p>
            ) : (
              <ul className="space-y-3">
                {activeMembers.map((member) => (
                  <CoHostRow
                    key={member.userId}
                    member={member}
                    groups={groups.data}
                    editing={editing === member.userId}
                    busy={saveScopes.isPending || revokeMember.isPending}
                    onEdit={() => setEditing(editing === member.userId ? null : member.userId)}
                    onSave={(grants) => saveScopes.mutate({ userId: member.userId, grants })}
                    onRevoke={() => revokeMember.mutate(member.userId)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="co-host-invites" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="co-host-invites" className="text-lg font-semibold">
                {t("pendingInvites")}{" "}
                <span className="font-normal text-muted-foreground">
                  {formatNumber(openInvitations.length, language)}
                </span>
              </h2>
              <Button
                variant="ghost"
                size="sm"
                disabled={invitations.isFetching}
                onClick={() => void invitations.refetch()}
              >
                <RefreshCw aria-hidden="true" /> {t("refresh")}
              </Button>
            </div>
            {!openInvitations.length ? (
              <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-6 text-sm text-muted-foreground">
                {t("noPendingInvitesDescription")}
              </p>
            ) : (
              <ul className="space-y-3">
                {openInvitations.map((invitation) => (
                  <li
                    key={invitation.id}
                    className="flex flex-col gap-3 rounded-xl border border-foreground/10 bg-card px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{invitation.email}</span>
                        <Chip tone={invitation.status === "SENT" ? "success" : "neutral"}>
                          {invitation.status === "SENT" ? t("emailSent") : t("emailPending")}
                        </Chip>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t("expiresAt")}{" "}
                        {formatDate(invitation.expiresAt, language, {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <GrantSummary grants={invitation.grants} groupNames={groupNames} />
                    </div>
                    <ConfirmDialog
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0 self-start"
                        >
                          {t("revokeInvite")}
                        </Button>
                      }
                      title={t("revokeInviteConfirmTitle")}
                      description={t("revokeInviteConfirmDescription", { email: invitation.email })}
                      cancelLabel={t("keepInvite")}
                      confirmLabel={revokeInvitation.isPending ? t("revoking") : t("revoke")}
                      onConfirm={() => revokeInvitation.mutate(invitation.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {invitationAvailable && (
          <section
            aria-labelledby="co-host-invite-form"
            id="co-host-invitation"
            className="space-y-5 rounded-xl border border-foreground/10 bg-card p-5 lg:sticky lg:top-6"
          >
            <div>
              <h2 id="co-host-invite-form" className="text-lg font-semibold">
                {t("sendInvite")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("inviteDescription")}</p>
            </div>
            <FormField control={form.control} name="email" label={t("coHostEmail")}>
              {(field) => (
                <Input
                  {...field}
                  value={String(field.value ?? "")}
                  type="email"
                  autoComplete="email"
                  placeholder="linh.nguyen@gmail.com"
                />
              )}
            </FormField>
            <ScopeEditor
              groups={groups.data}
              submitLabel={t("sendInvite")}
              busy={invite.isPending}
              onSubmit={(grants) =>
                void form.handleSubmit((values) => invite.mutate({ email: values.email, grants }))()
              }
            />
            {invite.isPending && (
              <p role="status" className="text-sm text-muted-foreground">
                {t("sendingInvite")}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// A stable pale tint per person, so the same co-host is recognised across lists.
function personHue(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const last = words.at(-1) ?? "?";
  return last.charAt(0).toLocaleUpperCase("vi");
}

function CoHostRow({
  member,
  groups,
  editing,
  busy,
  onEdit,
  onSave,
  onRevoke,
}: {
  member: CoHost;
  groups: { id: string; name: string }[];
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onSave: (grants: PermissionScope[]) => void;
  onRevoke: () => void;
}) {
  const { t } = useTranslation("cohost");
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const grants =
    member.scopes ??
    member.permissions.flatMap((permission) => {
      if (!Object.hasOwn(PERMISSION_LABELS, permission)) return [];
      return [
        {
          permission: permission as keyof typeof PERMISSION_LABELS,
          weddingWide: true,
          groupIds: [],
        },
      ];
    });
  return (
    <li className="space-y-4 rounded-xl border border-foreground/10 bg-card px-4 py-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-foreground"
          style={{ backgroundColor: `hsl(${personHue(member.userId)} 70% 92%)` }}
        >
          {initials(member.fullName)}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate font-medium">{member.fullName}</p>
          <p className="truncate text-sm text-muted-foreground">{member.email}</p>
          {!editing && <GrantSummary grants={member.scopes ?? []} groupNames={groupNames} />}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          aria-expanded={editing}
          onClick={onEdit}
        >
          {editing ? t("closeEditor") : t("editScope")}
        </Button>
      </div>
      {editing && (
        <div className="sm:pl-[3.25rem]">
          <ScopeEditor
            groups={groups}
            initialGrants={grants}
            submitLabel={t("saveScope")}
            busy={busy}
            onSubmit={onSave}
            footerStart={
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" size="sm" className="text-destructive">
                    {t("revokeAccess")}
                  </Button>
                }
                title={t("revokeAccessConfirmTitle")}
                description={t("revokeAccessConfirmDescription", { name: member.fullName })}
                cancelLabel={t("cancel")}
                confirmLabel={t("revokeAccess")}
                onConfirm={onRevoke}
              />
            }
          />
        </div>
      )}
    </li>
  );
}

/** What a co-host can do, one line per part of the wedding, in the editor's order. */
function GrantSummary({
  grants,
  groupNames,
}: {
  grants: PermissionScope[];
  groupNames: Map<string, string>;
}) {
  const { t } = useTranslation("cohost");
  if (!grants.length) return <p className="text-sm text-muted-foreground">{t("noPermissions")}</p>;
  const byPermission = new Map(grants.map((grant) => [grant.permission, grant]));
  return (
    <dl className="grid gap-x-3 gap-y-1 pt-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
      {PERMISSION_AREAS.map((area) => {
        const areaGrants = area.permissions.flatMap((permission) => {
          const grant = byPermission.get(permission);
          return grant ? [grant] : [];
        });
        if (!areaGrants.length) return null;
        return (
          <div key={area.key} className="contents">
            <dt className="text-muted-foreground">{t(`areas.${area.key}`)}</dt>
            <dd className="flex min-w-0 flex-wrap gap-x-1">
              {areaGrants.map((grant, index) => (
                <span key={grant.permission} className="whitespace-nowrap">
                  {index > 0 && <span className="text-muted-foreground"> · </span>}
                  {t(`permissions.${grant.permission}`)}{" "}
                  <span className="text-muted-foreground">
                    ({scopeDescription(grant, groupNames, t)})
                  </span>
                </span>
              ))}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
