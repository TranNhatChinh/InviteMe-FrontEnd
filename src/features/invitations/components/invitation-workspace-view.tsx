"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  History,
  LoaderCircle,
  Mail,
  MessageSquareText,
  RefreshCw,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
// eslint-disable-next-line architecture/boundaries -- Invitation composition needs the wedding delivery quota gate.
import { FeatureLimitNotice, useWeddingPlan } from "@/features/plans";
import { useLocale } from "@/i18n/language-context";
import { formatNumber } from "@/i18n/format";
import { MessageRecipientPicker } from "@/shared/components/message-recipient-picker";
import { MAX_MESSAGE_RECIPIENTS, type MessageRecipient } from "@/shared/lib/message-recipients";
import { Button, buttonVariants } from "@/shared/ui/button";
import { countSmsSegments } from "../utils/sms-segments";
import type {
  InvitationBatch,
  InvitationChannel,
  InvitationDraft,
  InvitationPreview,
  InvitationSmsPreflight,
} from "../api/invitation-messaging.api";

type PlanQuery = ReturnType<typeof useWeddingPlan>;
type Quota = { limit: number | null; used: number; remaining: number | null; feature: string };
type QuotaIssue = { channel: InvitationChannel; quota: Quota | null } | undefined;
type Recipient = MessageRecipient & { groupId?: string | null; groupName?: string | null };
type Group = { id: string; name: string };
type FieldName = "subject" | "content" | "smsContent";

type Props = {
  weddingId: string;
  isPublished: boolean;
  canViewGuests: boolean;
  isOwner: boolean;
  plan: PlanQuery;
  planUnavailable: boolean;
  quotaIssue: QuotaIssue;
  quotaFor: (channel: InvitationChannel) => Quota | null;
  draft: InvitationDraft | null | undefined;
  subject: string;
  content: string;
  smsContent: string;
  dirty: boolean;
  emailFallback: boolean;
  smsFallback: boolean;
  smsPreflight: InvitationSmsPreflight | undefined;
  smsPreflightPending: boolean;
  smsPreflightError: string;
  emailInstructions: string;
  setEmailInstructions: (value: string) => void;
  smsInstructions: string;
  setSmsInstructions: (value: string) => void;
  saveMessage: string;
  templateErrors: string[];
  conflictDraft: InvitationDraft | null;
  onRestoreLatest: () => void;
  onRetryOnLatest: () => void;
  savePending: boolean;
  generatePending: boolean;
  generateSmsPending: boolean;
  testPending: boolean;
  generateError: string;
  generateSmsError: string;
  testError: string;
  onUpdateField: (key: FieldName, value: string) => void;
  onGenerateEmail: () => void;
  onGenerateSms: () => void;
  onSendTest: () => void;
  composeChannel: InvitationChannel;
  onComposeChannelChange: (channel: InvitationChannel) => void;
  allRecipients: Recipient[];
  groups: Group[];
  selectedIds: string[];
  onSelectedIdsChange: Dispatch<SetStateAction<string[]>>;
  recipientMode: "GUESTS" | "GROUP";
  onRecipientModeChange: (mode: "GUESTS" | "GROUP") => void;
  groupId: string;
  onGroupIdChange: (id: string) => void;
  recipientGroupFilter: string;
  onRecipientGroupFilterChange: (id: string) => void;
  recipientStatusFilter: string;
  onRecipientStatusFilterChange: (status: string) => void;
  filteredRecipients: Recipient[];
  recipientsPending: boolean;
  recipientsError: boolean;
  recipientsErrorMessage: string;
  onReloadRecipients: () => void;
  channels: InvitationChannel[];
  onChannelsChange: (channels: InvitationChannel[]) => void;
  missingContactCount: number;
  selectionCount: number;
  previewGuestId: string;
  onPreviewGuestIdChange: (id: string) => void;
  preview: InvitationPreview | undefined;
  previewPending: boolean;
  previewError: string;
  previewReviewed: boolean;
  onRefreshPreview: () => void;
  canSend: boolean;
  sendPending: boolean;
  hasUncertainSend: boolean;
  sendError: string;
  sendErrorIsDefinitive: boolean;
  onConfirmSend: () => void;
  onRetryUncertain: () => void;
  activeBatchId: string;
  batch: InvitationBatch | undefined;
  batchStatusLabel: (status: string) => string;
  batchPending: boolean;
  batchError: string;
  batchRefreshing: boolean;
  onRefreshBatch: () => void;
  retryPending: boolean;
  retryCount: number | null;
  retryError: string;
  onRetryFailed: () => void;
  onOpenHistory: () => void;
  formatBatchDate: (value: string) => string;
};

type Pane = "COMPOSE" | "PREVIEW" | "RECIPIENTS";

export function InvitationWorkspaceView(props: Props) {
  const { t } = useTranslation("invitations");
  const { t: tPlans } = useTranslation("plans");
  const { language } = useLocale();
  const [mobilePane, setMobilePane] = useState<Pane>("COMPOSE");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(props.selectedIds), [props.selectedIds]);
  const selectedRecipients = useMemo(
    () => props.allRecipients.filter((recipient) => selectedSet.has(recipient.id)),
    [props.allRecipients, selectedSet],
  );
  const pickerRecipients = useMemo(
    () =>
      props.recipientMode === "GROUP"
        ? props.allRecipients.filter((recipient) => recipient.groupId === props.groupId)
        : props.filteredRecipients,
    [props.allRecipients, props.filteredRecipients, props.groupId, props.recipientMode],
  );
  const emailReadyCount = selectedRecipients.filter((guest) => Boolean(guest.email?.trim())).length;
  const smsReadyCount = selectedRecipients.filter((guest) => Boolean(guest.phone?.trim())).length;
  const smsEstimate = countSmsSegments(props.smsContent);
  const smsCopyLimit = props.smsPreflight?.recommendedCopyLimit ?? props.draft?.smsCopyLimit ?? 60;
  const previewSmsSegments = props.preview
    ? (props.preview.smsSegments ?? countSmsSegments(props.preview.smsContent).segments)
    : undefined;
  const hasSmsOverLimit = previewSmsSegments !== undefined && previewSmsSegments > 3;
  const sendAllowed = props.canSend && !(props.channels.includes("SMS") && hasSmsOverLimit);
  const queueing = props.sendPending;
  const activeChannelQuota = props.quotaIssue?.quota;
  const batchStatusTone =
    props.batch?.status === "FAILED" || props.batch?.status === "PARTIAL_FAILED"
      ? "bg-destructive/10 text-destructive"
      : props.batch?.status === "PENDING" ||
          props.batch?.status === "ACCEPTED" ||
          props.batch?.status === "NEEDS_REVIEW" ||
          props.batch?.status === "SIMULATED"
        ? "bg-amber-50 text-amber-800"
        : "bg-emerald-50 text-emerald-800";

  function toggleChannel(channel: InvitationChannel, checked: boolean) {
    props.onChannelsChange(
      checked
        ? [...new Set([...props.channels, channel])]
        : props.channels.filter((current) => current !== channel),
    );
  }

  function addCurrentGroup() {
    const groupGuestIds = props.allRecipients
      .filter((guest) => guest.groupId === props.groupId)
      .map((guest) => guest.id);
    props.onSelectedIdsChange((current) => [...new Set([...current, ...groupGuestIds])]);
  }

  function renderChannel(channel: InvitationChannel) {
    const email = channel === "EMAIL";
    const quota = props.quotaFor(channel);
    const included = props.channels.includes(channel);
    const disabled =
      props.sendPending ||
      props.hasUncertainSend ||
      props.plan.isPending ||
      (quota?.remaining === 0 && !included);
    return (
      <label
        key={channel}
        className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${included ? "bg-primary/10 text-foreground" : "hover:bg-muted/60"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <input
          type="checkbox"
          className="size-4 accent-primary-hover"
          checked={included}
          disabled={disabled}
          onChange={(event) => toggleChannel(channel, event.target.checked)}
        />
        {email ? <Mail className="size-4" /> : <MessageSquareText className="size-4" />}
        <span className="flex-1">{channel}</span>
        {quota && (
          <span className="text-xs text-muted-foreground">
            {quota.remaining === null
              ? t("plan.unlimited")
              : formatNumber(quota.remaining, language)}
          </span>
        )}
      </label>
    );
  }

  function renderPlanMessage() {
    if (props.plan.isPending)
      return (
        <p role="status" className="text-xs text-muted-foreground">
          {t("plan.checking")}
        </p>
      );
    if (props.planUnavailable)
      return (
        <FeatureLimitNotice
          status="unavailable"
          title={tPlans("gate.unknownTitle")}
          description={tPlans("gate.unknownDescription")}
          retryLabel={tPlans("gate.retry")}
          onRetry={() => void props.plan.refetch()}
          variant="compact"
        />
      );
    if (!activeChannelQuota || !props.plan.data || props.plan.isError) return null;
    const notIncluded = activeChannelQuota.limit === 0;
    return (
      <FeatureLimitNotice
        title={t(notIncluded ? "plan.channelNotIncludedTitle" : "plan.quotaInsufficientTitle", {
          channel: props.quotaIssue?.channel,
        })}
        description={
          notIncluded
            ? props.isOwner
              ? tPlans("gate.notIncludedOwnerDescription", {
                  feature: tPlans(`gate.features.${activeChannelQuota.feature}`),
                  planName: props.plan.data.planName,
                })
              : tPlans("gate.contactOwner", {
                  feature: tPlans(`gate.features.${activeChannelQuota.feature}`),
                  planName: props.plan.data.planName,
                })
            : t("plan.quotaInsufficientDescription", {
                remaining:
                  activeChannelQuota.remaining === null
                    ? t("plan.unlimited")
                    : formatNumber(activeChannelQuota.remaining, language),
                requested: formatNumber(props.selectionCount, language),
              })
        }
        usage={t("plan.quotaUsage", {
          used: formatNumber(activeChannelQuota.used, language),
          limit:
            activeChannelQuota.limit === null
              ? t("plan.unlimited")
              : formatNumber(activeChannelQuota.limit, language),
        })}
        variant="compact"
        upgradeHref={
          props.isOwner ? `/weddings/${encodeURIComponent(props.weddingId)}/plan` : undefined
        }
        upgradeLabel={props.isOwner ? tPlans("gate.viewPlans") : undefined}
      />
    );
  }

  const paneButtonClass = (pane: Pane) =>
    `min-h-10 flex-1 rounded-lg px-3 text-sm font-medium transition-colors ${mobilePane === pane ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`;
  const mobilePanelClass = (pane: Pane) =>
    `${mobilePane === pane ? "block" : "hidden"} min-w-0 xl:block`;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-muted/60 p-1 xl:hidden">
        <div role="tablist" aria-label={t("workspacePanes")} className="flex gap-1">
          {(
            [
              ["COMPOSE", t("stepComposeTitle")],
              ["PREVIEW", t("livePreview")],
              ["RECIPIENTS", t("stepRecipientsTitle")],
            ] as const
          ).map(([pane, label]) => (
            <button
              key={pane}
              type="button"
              role="tab"
              aria-selected={mobilePane === pane}
              className={paneButtonClass(pane)}
              onClick={() => setMobilePane(pane)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(315px,0.9fr)]">
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(285px,0.9fr)]">
          <section
            aria-label={t("stepComposeTitle")}
            className={`${mobilePanelClass("COMPOSE")} rounded-2xl border bg-card p-4 sm:p-5`}
          >
            {!props.draft && (
              <p className="mb-4 rounded-lg bg-muted/70 p-3 text-sm text-muted-foreground">
                {t("noDraft")}
              </p>
            )}
            {!props.canViewGuests && (
              <p role="note" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                {t("guestViewRequired")}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div>
                <h3 className="font-semibold">{t("stepComposeTitle")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("channelEditorHelp")}</p>
              </div>
              <div
                role="tablist"
                aria-label={t("composeChannel")}
                className="inline-flex rounded-xl bg-muted/70 p-1"
              >
                {(
                  [
                    ["SMS", <MessageSquareText key="sms-icon" className="size-4" />],
                    ["EMAIL", <Mail key="email-icon" className="size-4" />],
                  ] as const
                ).map(([channel, icon]) => (
                  <button
                    key={channel}
                    type="button"
                    role="tab"
                    aria-selected={props.composeChannel === channel}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm transition-colors ${props.composeChannel === channel ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => props.onComposeChannelChange(channel)}
                  >
                    {icon}
                    {channel}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 pt-4">
              {props.composeChannel === "EMAIL" ? (
                <>
                  <label className="block space-y-1.5 text-sm font-medium">
                    {t("emailSubject")}
                    <input
                      className="h-10 w-full rounded-lg border bg-background px-3 font-normal outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                      maxLength={200}
                      value={props.subject}
                      onChange={(event) => props.onUpdateField("subject", event.target.value)}
                      placeholder={t("emailSubjectPlaceholder")}
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm font-medium">
                    <span className="flex items-center justify-between gap-3">
                      <span>{t("emailContent")}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {props.content.length}/10,000
                      </span>
                    </span>
                    <textarea
                      className="min-h-48 w-full resize-y rounded-lg border bg-background p-3 font-normal leading-relaxed outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                      maxLength={10000}
                      value={props.content}
                      onChange={(event) => props.onUpdateField("content", event.target.value)}
                      placeholder={t("emailContentPlaceholder")}
                    />
                  </label>
                  <div className="grid min-w-0 gap-2">
                    <details className="w-full min-w-0 rounded-lg bg-primary/5 px-3 py-2">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium marker:hidden">
                        <Sparkles className="size-3.5 text-primary-hover" />
                        {t("aiInstructions")}
                      </summary>
                      <textarea
                        className="mt-2 min-h-24 w-full resize-y rounded-lg border bg-background p-3 text-sm font-normal leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        rows={3}
                        maxLength={500}
                        value={props.emailInstructions}
                        onChange={(event) => props.setEmailInstructions(event.target.value)}
                        placeholder={t("aiInstructionsPlaceholder")}
                      />
                    </details>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-10 w-full justify-center whitespace-nowrap"
                      disabled={
                        props.generatePending ||
                        props.generateSmsPending ||
                        props.savePending ||
                        Boolean(props.conflictDraft) ||
                        props.emailInstructions.length > 500
                      }
                      onClick={() => {
                        if (
                          (props.draft || props.dirty) &&
                          !window.confirm(t("replaceEmailConfirm"))
                        )
                          return;
                        props.onGenerateEmail();
                      }}
                    >
                      {props.generatePending ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Sparkles />
                      )}
                      {t("generateEmailWithAi")}
                    </Button>
                  </div>
                  {props.emailFallback && (
                    <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                      {t("emailFallback")}
                    </p>
                  )}
                  {props.generateError && (
                    <p role="alert" className="text-sm text-destructive">
                      {props.generateError}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <label className="block space-y-1.5 text-sm font-medium">
                    <span className="flex items-center justify-between gap-3">
                      <span>{t("smsContent")}</span>
                      <span className={`text-xs font-normal ${props.smsContent.length > smsCopyLimit ? "text-amber-800" : "text-muted-foreground"}`}>
                        {t("smsUtf16Counter", { current: props.smsContent.length, limit: smsCopyLimit })}
                      </span>
                    </span>
                    <textarea
                      className="min-h-36 w-full resize-y rounded-lg border bg-background p-3 font-normal leading-relaxed outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                      maxLength={10000}
                      disabled={props.generateSmsPending}
                      value={props.smsContent}
                      onChange={(event) => props.onUpdateField("smsContent", event.target.value)}
                      placeholder={t("smsContentPlaceholder")}
                    />
                  </label>
                  <div
                    className={`text-right text-xs ${smsEstimate.segments > 3 ? "text-destructive" : "text-muted-foreground"}`}
                    aria-live="polite"
                  >
                    {t("smsDraftSegments", {
                      units: smsEstimate.units,
                      encoding: smsEstimate.encoding,
                      segments: smsEstimate.segments,
                    })}
                    {smsEstimate.segments > 3 ? ` · ${t("smsOverLimit")}` : ""}
                  </div>
                  {props.smsContent.length > smsCopyLimit && (
                    <p role="status" className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-950">
                      {t("smsCopyWillBeShortened", { limit: smsCopyLimit })}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{t("smsAiCopyLimit")}</p>
                  <div className="grid min-w-0 gap-2">
                    <details className="w-full min-w-0 rounded-lg bg-primary/5 px-3 py-2">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium marker:hidden">
                        <Sparkles className="size-3.5 text-primary-hover" />
                        {t("aiInstructions")}
                      </summary>
                      <textarea
                        className="mt-2 min-h-24 w-full resize-y rounded-lg border bg-background p-3 text-sm font-normal leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        rows={3}
                        maxLength={500}
                        value={props.smsInstructions}
                        onChange={(event) => props.setSmsInstructions(event.target.value)}
                        placeholder={t("aiInstructionsPlaceholder")}
                      />
                    </details>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-10 w-full justify-center whitespace-nowrap"
                      disabled={
                        props.generateSmsPending ||
                        props.generatePending ||
                        props.savePending ||
                        Boolean(props.conflictDraft) ||
                        props.smsInstructions.length > 500
                      }
                      onClick={() => {
                        if (props.smsContent.trim() && !window.confirm(t("replaceSmsConfirm")))
                          return;
                        props.onGenerateSms();
                      }}
                    >
                      {props.generateSmsPending ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Sparkles />
                      )}
                      {t("generateSmsSuggestion")}
                    </Button>
                  </div>
                  {props.smsFallback && (
                    <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                      {t("smsFallback")}
                    </p>
                  )}
                  {props.generateSmsError && (
                    <p role="alert" className="text-sm text-destructive">
                      {props.generateSmsError}
                    </p>
                  )}
                </>
              )}

              {props.templateErrors.length > 0 && (
                <ul
                  role="alert"
                  className="list-inside list-disc rounded-lg bg-destructive/5 p-3 text-sm text-destructive"
                >
                  {props.templateErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              )}
              {props.conflictDraft && (
                <div
                  role="alert"
                  className="space-y-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"
                >
                  <p className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {t("serverHasVersion", { version: props.conflictDraft.version })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={props.onRestoreLatest}
                    >
                      {t("loadLatestDiscardEdits")}
                    </Button>
                    <Button type="button" size="sm" onClick={props.onRetryOnLatest}>
                      {t("keepEditsUseLatest")}
                    </Button>
                  </div>
                </div>
              )}

              {props.saveMessage && (
                <p role="status" className="text-sm text-muted-foreground">
                  {props.saveMessage}
                </p>
              )}
              {props.draft && (
                <p className="text-xs text-muted-foreground">
                  {t("version", { version: props.draft.version })}
                </p>
              )}
            </div>
          </section>

          <section
            aria-label={t("livePreview")}
            className={`${mobilePanelClass("PREVIEW")} rounded-2xl border bg-card p-4 sm:p-5`}
          >
            <div className="flex items-start justify-between gap-3 border-b pb-3">
              <div>
                <h3 className="font-semibold">{t("livePreview")}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("previewDescription")}
                </p>
              </div>
              {props.previewReviewed && (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              )}
            </div>
            <label className="mt-3 block space-y-1.5 text-sm font-medium">
              {t("previewRecipient")}
              <select
                className="h-10 w-full rounded-lg border bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={props.previewGuestId}
                disabled={props.recipientsPending || props.recipientsError}
                onChange={(event) => props.onPreviewGuestIdChange(event.target.value)}
              >
                <option value="">{t("selectGuest")}</option>
                {props.allRecipients.map((guest) => (
                  <option key={guest.id} value={guest.id}>
                    {guest.recipientName}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              disabled={
                !props.previewGuestId ||
                !props.draft ||
                props.previewPending ||
                props.savePending ||
                props.templateErrors.length > 0
              }
              onClick={props.onRefreshPreview}
            >
              {props.previewPending || props.savePending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              {props.dirty ? t("saveAndUpdatePreview") : t("updateExactPreview")}
            </Button>
            {props.dirty && (
              <p className="mt-2 text-xs text-muted-foreground">{t("saveBeforePreview")}</p>
            )}
            {props.previewError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {props.previewError}
              </p>
            )}
            {!props.preview && !props.previewPending && !props.previewError && (
              <div className="mt-4 flex min-h-64 items-center justify-center rounded-xl bg-muted/50 p-5 text-center text-sm text-muted-foreground">
                {t("previewEmpty")}
              </div>
            )}
            {props.previewPending && !props.preview && (
              <div
                role="status"
                className="mt-4 flex min-h-64 items-center justify-center gap-2 rounded-xl bg-muted/50 text-sm text-muted-foreground"
              >
                <LoaderCircle className="size-4 animate-spin" />
                {t("loadingPreview")}
              </div>
            )}
            {props.preview && props.composeChannel === "EMAIL" && (
              <div className="mt-4 overflow-hidden rounded-xl border bg-white">
                <div className="border-b px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground">{t("emailSubject")}</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-slate-900">
                    {props.preview.subject}
                  </p>
                </div>
                <iframe
                  className="h-[min(52vh,560px)] min-h-72 w-full bg-white"
                  srcDoc={props.preview.emailHtml}
                  title={t("emailPreviewTitle")}
                  sandbox=""
                  loading="lazy"
                />
              </div>
            )}
            {props.preview && props.composeChannel === "SMS" && (
              <div className="mx-auto mt-4 max-w-[18rem] overflow-hidden rounded-[2rem] border-[5px] border-rose-100 bg-white p-2">
                <div className="flex h-8 items-center justify-between border-b px-2 text-[10px] font-medium text-slate-600">
                  <span>9:41</span>
                  <span className="truncate px-2">{props.preview.recipientName}</span>
                  <span aria-hidden="true">●●●</span>
                </div>
                <div className="flex min-h-[19rem] flex-col justify-end bg-white px-1 pb-2 pt-4">
                  <p className="max-w-[94%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2.5 text-[13px] leading-relaxed text-slate-900">
                    {props.preview.smsContent}
                  </p>
                  <p
                    className={`mt-2 text-[11px] ${hasSmsOverLimit ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {t("smsSegmentCount", {
                      units:
                        props.preview.smsUnits ?? countSmsSegments(props.preview.smsContent).units,
                      encoding:
                        props.preview.smsEncoding ??
                        countSmsSegments(props.preview.smsContent).encoding,
                      segments:
                        props.preview.smsSegments ??
                        countSmsSegments(props.preview.smsContent).segments,
                    })}
                    {hasSmsOverLimit ? ` ${t("smsOverLimit")}` : ""}
                  </p>
                  {props.preview.smsCopyWasShortened && (
                    <p role="status" className="mt-2 max-w-[94%] rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-950">
                      {t("smsCopyShortenedForGuest", { name: props.preview.recipientName })}
                    </p>
                  )}
                </div>
              </div>
            )}
            {props.previewReviewed && (
              <p role="status" className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
                <CheckCircle2 className="size-4" />
                {t("previewReviewed")}
              </p>
            )}
            <div className="mt-4 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={
                  props.testPending ||
                  props.dirty ||
                  !props.isPublished ||
                  !props.previewGuestId ||
                  props.composeChannel !== "EMAIL"
                }
                onClick={() => {
                  if (window.confirm(t("testEmailConfirm"))) props.onSendTest();
                }}
              >
                {props.testPending ? <LoaderCircle className="animate-spin" /> : <Send />}
                {t("sendTestToMyEmail")}
              </Button>
              {props.dirty && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  {t("saveBeforeTest")}
                </p>
              )}
              {props.testError && (
                <p role="alert" className="mt-2 text-center text-xs text-destructive">
                  {props.testError}
                </p>
              )}
            </div>
          </section>
        </div>

        <aside
          aria-label={t("stepRecipientsTitle")}
          className={`${mobilePanelClass("RECIPIENTS")} rounded-2xl border bg-card p-4 sm:p-5 xl:sticky xl:top-4 xl:self-start`}
        >
          <div className="flex items-start justify-between gap-3 border-b pb-3">
            <div className="flex items-center gap-2.5">
              <Users className="size-5 text-primary-hover" />
              <div>
                <h3 className="font-semibold">{t("stepRecipientsTitle")}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("recipientPanelHelp")}</p>
              </div>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary-hover">
              {formatNumber(props.selectionCount, language)}
            </span>
          </div>

          <div
            role="tablist"
            aria-label={t("recipientMode")}
            className="mt-3 grid grid-cols-2 rounded-lg bg-muted/60 p-1"
          >
            {(
              [
                ["GROUP", t("chooseGroup")],
                ["GUESTS", t("chooseGuests")],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={props.recipientMode === mode}
                className={`min-h-9 rounded-md px-2 text-sm transition-colors ${props.recipientMode === mode ? "bg-white font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => props.onRecipientModeChange(mode)}
              >
                {label}
              </button>
            ))}
          </div>

          {props.recipientMode === "GROUP" && (
            <div className="mt-3 space-y-2">
              <label className="block space-y-1 text-xs font-medium">
                {t("guestGroup")}
                <select
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-normal"
                  value={props.groupId}
                  onChange={(event) => props.onGroupIdChange(event.target.value)}
                >
                  <option value="">{t("selectGroup")}</option>
                  {props.groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
              {props.groupId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={props.sendPending || props.hasUncertainSend}
                  onClick={addCurrentGroup}
                >
                  <Users className="size-4" />
                  {t("addWholeGroup")}
                </Button>
              )}
            </div>
          )}

          {props.recipientMode === "GUESTS" && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="sr-only" htmlFor={`guest-group-filter-${props.weddingId}`}>
                {t("filterGroup")}
              </label>
              <select
                id={`guest-group-filter-${props.weddingId}`}
                className="h-9 min-w-0 rounded-lg border bg-background px-2 text-xs"
                value={props.recipientGroupFilter}
                onChange={(event) => props.onRecipientGroupFilterChange(event.target.value)}
              >
                <option value="ALL">{t("filterAllGroups")}</option>
                {props.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor={`guest-status-filter-${props.weddingId}`}>
                {t("filterDeliveryStatus")}
              </label>
              <select
                id={`guest-status-filter-${props.weddingId}`}
                className="h-9 min-w-0 rounded-lg border bg-background px-2 text-xs"
                value={props.recipientStatusFilter}
                onChange={(event) => props.onRecipientStatusFilterChange(event.target.value)}
              >
                <option value="ALL">{t("filterAllStatuses")}</option>
                <option value="NOT_IN_BATCH">{t("filterNotInLatestBatch")}</option>
                <option value="PENDING">{t("filterPending")}</option>
                <option value="ACCEPTED">{t("filterAccepted")}</option>
                <option value="DELIVERED">{t("filterDelivered")}</option>
                <option value="FAILED">{t("filterFailed")}</option>
              </select>
            </div>
          )}
          {props.activeBatchId &&
            props.recipientMode === "GUESTS" &&
            props.recipientStatusFilter !== "ALL" && (
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {t("statusFilterScope")}
              </p>
            )}

          {props.recipientsError && (
            <div role="alert" className="mt-3 rounded-lg bg-destructive/5 p-3 text-sm">
              <p>{t("guestListFailed", { error: props.recipientsErrorMessage })}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={props.onReloadRecipients}
              >
                {t("reload")}
              </Button>
            </div>
          )}
          {!props.canViewGuests && (
            <p role="note" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
              {t("guestViewRequired")}
            </p>
          )}
          {!props.recipientsError && props.recipientMode === "GROUP" && !props.groupId && (
            <p className="mt-4 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
              {t("selectGroupToContinue")}
            </p>
          )}
          {props.canViewGuests &&
            !props.recipientsError &&
            (props.recipientMode === "GUESTS" || props.groupId) && (
              <div className="mt-3">
                <MessageRecipientPicker
                  recipients={pickerRecipients}
                  selectedIds={props.selectedIds}
                  onChange={(ids) => props.onSelectedIdsChange(ids)}
                  loading={props.recipientsPending}
                  failed={false}
                  onRetry={props.onReloadRecipients}
                  disabled={props.sendPending || props.hasUncertainSend}
                  totalRecipientCount={props.allRecipients.length}
                  selectionHint={t("filteredSelectionHint")}
                  renderRecipientMeta={(guest) => (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      {guest.groupName && <span>{guest.groupName}</span>}
                      <span className={guest.email?.trim() ? "text-emerald-700" : "text-rose-700"}>
                        {guest.email?.trim() ? t("hasEmail") : t("missingEmail")}
                      </span>
                      <span className={guest.phone?.trim() ? "text-emerald-700" : "text-rose-700"}>
                        {guest.phone?.trim() ? t("hasPhone") : t("missingPhone")}
                      </span>
                    </span>
                  )}
                />
              </div>
            )}
          {props.selectionCount > MAX_MESSAGE_RECIPIENTS && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {t("maxRecipients")}
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 text-xs">
            <div>
              <p className="text-muted-foreground">{t("emailRecipientsReady")}</p>
              <p className="mt-0.5 font-semibold">{formatNumber(emailReadyCount, language)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("smsRecipientsReady")}</p>
              <p className="mt-0.5 font-semibold">{formatNumber(smsReadyCount, language)}</p>
            </div>
          </div>
          {props.missingContactCount > 0 && (
            <p
              role="note"
              className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-950"
            >
              {t("missingContacts", { count: props.missingContactCount })}
            </p>
          )}

          {props.channels.includes("SMS") && props.selectionCount > 0 && (
            <div
              role={props.smsPreflightError ? "alert" : "status"}
              aria-live="polite"
              className={`mt-3 rounded-lg p-3 text-xs leading-relaxed ${props.smsPreflight?.unsendableCount || props.smsPreflightError ? "bg-rose-50 text-rose-900" : "bg-muted/50 text-muted-foreground"}`}
            >
              {props.smsPreflightPending ? (
                <p className="flex items-center gap-2">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  {t("smsPreflightPending")}
                </p>
              ) : props.smsPreflightError ? (
                <p>{props.smsPreflightError}</p>
              ) : props.smsPreflight ? (
                <>
                  <p className="font-medium">
                    {t("smsPreflightSummary", {
                      count: props.smsPreflight.recipientCount,
                      segments: props.smsPreflight.maximumSegments,
                    })}
                  </p>
                  {props.smsPreflight.shortenedCount > 0 && (
                    <p className="mt-1">
                      {t("smsResolveShortened", { count: props.smsPreflight.shortenedCount })}
                    </p>
                  )}
                  {props.smsPreflight.unsendableCount > props.smsPreflight.shortenedCount && (
                    <p className="mt-1">
                      {t("smsUnsendableRecipients", {
                        count: props.smsPreflight.unsendableCount - props.smsPreflight.shortenedCount,
                      })}
                    </p>
                  )}
                  {props.smsPreflight.issues.slice(0, 3).map((issue) => (
                    <p key={issue.guestId} className="mt-1 truncate">
                      <span className="font-medium">{issue.recipientName}</span>{" — "}
                      {issue.code === "SMS_COPY_WILL_BE_SHORTENED"
                        ? t("smsCopyShortenedIssue")
                        : issue.code === "SMS_CONTACT_REQUIRED"
                          ? t("errors.invalidPhone")
                          : issue.code === "INVITATION_LINK_INVALID"
                            ? t("errors.invalidInvitationLink")
                            : issue.code === "SMS_RECIPIENT_DETAILS_TOO_LONG"
                              ? t("errors.smsRecipientDetailsTooLong")
                              : t("errors.smsTooLong")}
                    </p>
                  ))}
                  {(props.smsPreflight.issues.length > 3 || props.smsPreflight.additionalIssueCount > 0) && (
                    <p className="mt-1">
                      {t("smsMoreRecipientIssues", {
                        count: props.smsPreflight.issues.length - 3 + props.smsPreflight.additionalIssueCount,
                      })}
                    </p>
                  )}
                </>
              ) : (
                <p>{t("smsPreflightPending")}</p>
              )}
            </div>
          )}

          <fieldset className="mt-4 border-t pt-3">
            <legend className="text-sm font-medium">{t("deliveryChannels")}</legend>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {renderChannel("EMAIL")}
              {renderChannel("SMS")}
            </div>
            {props.channels.length > 1 && (
              <p className="mt-1 text-[11px] text-muted-foreground">{t("reviewChannelHelp")}</p>
            )}
            {!props.channels.length && (
              <p className="mt-1 text-xs text-destructive">{t("selectAtLeastOneChannel")}</p>
            )}
          </fieldset>

          {renderPlanMessage()}
          {!props.isPublished && (
            <p className="mt-3 rounded-lg bg-muted/60 p-2.5 text-xs">{t("publishBeforeSend")}</p>
          )}
          {props.dirty && (
            <p className="mt-2 rounded-lg bg-primary/5 p-2.5 text-xs">{t("saveBeforeSend")}</p>
          )}
          {props.sendError && (
            <div
              role="alert"
              className="mt-3 rounded-lg bg-destructive/5 p-3 text-sm text-destructive"
            >
              <p>
                {props.hasUncertainSend && !props.sendErrorIsDefinitive
                  ? t("uncertainSendDetails")
                  : props.sendError}
              </p>
              {props.hasUncertainSend && !props.sendErrorIsDefinitive && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={props.sendPending}
                  onClick={props.onRetryUncertain}
                >
                  {props.sendPending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                  {t("retrySameRequest")}
                </Button>
              )}
            </div>
          )}

          <div className="mt-4 hidden xl:block">
            <Button
              type="button"
              className="w-full"
              disabled={!sendAllowed}
              onClick={() => setConfirmOpen(true)}
            >
              {queueing ? <LoaderCircle className="animate-spin" /> : <Send />}
              {queueing ? t("queueingSend") : t("queueSend", { count: props.selectionCount })}
            </Button>
            {!sendAllowed && props.selectionCount > 0 && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {props.channels.includes("SMS") && props.smsPreflightPending
                  ? t("smsPreflightPending")
                  : props.channels.includes("SMS") && props.smsPreflightError
                    ? t("smsPreflightError")
                    : props.channels.includes("SMS") && (props.smsPreflight?.unsendableCount ?? 0) > 0
                      ? (props.smsPreflight?.shortenedCount ?? 0) > 0
                        ? t("smsResolveShortened", { count: props.smsPreflight?.shortenedCount ?? 0 })
                        : t("smsUnsendableRecipients", { count: props.smsPreflight?.unsendableCount ?? 0 })
                      : hasSmsOverLimit && props.channels.includes("SMS")
                        ? t("smsOverLimit")
                        : !props.previewReviewed
                          ? t("previewMustBeReviewed")
                          : t("reviewRequirements")}
              </p>
            )}
          </div>
        </aside>
      </div>

      <div className="sticky bottom-0 z-20 -mx-3 flex items-center gap-3 border-t bg-background/95 px-3 py-3 backdrop-blur-sm xl:hidden">
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {t("recipientsSelectedCount", { count: props.selectionCount })}
        </span>
        <Button type="button" disabled={!sendAllowed} onClick={() => setConfirmOpen(true)}>
          {queueing ? <LoaderCircle className="animate-spin" /> : <Send />}
          {queueing ? t("queueingSend") : t("queueSendShort")}
        </Button>
      </div>

      {props.activeBatchId && (
        <section
          className="rounded-2xl border bg-card px-4 py-4 sm:px-5"
          aria-label={t("latestBatch")}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{t("latestBatch")}</h3>
                {props.batch && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${batchStatusTone}`}
                  >
                    {props.batchStatusLabel(props.batch.status)}
                  </span>
                )}
              </div>
              {props.batch && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {props.formatBatchDate(props.batch.createdAt)} ·{" "}
                  {[...new Set(props.batch.jobs.map((job) => job.channel))].join(" + ")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={props.batchRefreshing}
                onClick={props.onRefreshBatch}
              >
                {props.batchRefreshing ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                {t("refresh")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={props.onOpenHistory}>
                <History />
                {t("viewBatchDetails")}
              </Button>
              {props.batch?.jobs.some((job) => job.status === "FAILED") && (
                <Button
                  type="button"
                  size="sm"
                  disabled={props.retryPending}
                  onClick={props.onRetryFailed}
                >
                  {props.retryPending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                  {t("retryFailed")}
                </Button>
              )}
            </div>
          </div>
          {props.batchPending ? (
            <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              {t("loadingStatus")}
            </p>
          ) : props.batchError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {props.batchError}
            </p>
          ) : props.batch ? (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
              {[
                ["total", props.batch.totalCount],
                ["sent", props.batch.sentCount],
                ["accepted", props.batch.acceptedCount ?? 0],
                ["failedOrPending", `${props.batch.failedCount} / ${props.batch.pendingCount}`],
              ].map(([label, value]) => (
                <div key={String(label)} className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t(String(label))}</p>
                  <p className="mt-0.5 truncate text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div
              role="status"
              className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Clock3 className="size-4" />
              {t("loadingStatus")}
            </div>
          )}
          {(props.retryCount !== null || props.retryError) && (
            <p
              role={props.retryError ? "alert" : "status"}
              className={`mt-2 text-xs ${props.retryError ? "text-destructive" : "text-muted-foreground"}`}
            >
              {props.retryError || t("retriedJobs", { count: props.retryCount })}
            </p>
          )}
        </section>
      )}

      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-card p-5 shadow-xl sm:p-6">
            <AlertDialog.Title className="text-lg font-semibold">
              {t("confirmSendTitle")}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-1 text-sm text-muted-foreground">
              {t("confirmSendSummary")}
            </AlertDialog.Description>
            <dl className="mt-5 divide-y rounded-xl bg-muted/50 px-4">
              <div className="flex justify-between gap-3 py-3 text-sm">
                <dt className="text-muted-foreground">{t("deliveryChannels")}</dt>
                <dd className="text-right font-medium">
                  {props.channels.join(" + ") || t("noneSelected")}
                </dd>
              </div>
              <div className="flex justify-between gap-3 py-3 text-sm">
                <dt className="text-muted-foreground">{t("recipientsSummary")}</dt>
                <dd className="font-medium">{formatNumber(props.selectionCount, language)}</dd>
              </div>
              <div className="flex justify-between gap-3 py-3 text-sm">
                <dt className="text-muted-foreground">{t("contactsReady")}</dt>
                <dd className="font-medium">
                  {formatNumber(props.selectionCount - props.missingContactCount, language)}
                </dd>
              </div>
              {props.channels.includes("SMS") && props.preview?.smsSegments !== undefined && (
                <div className="flex justify-between gap-3 py-3 text-sm">
                  <dt className="text-muted-foreground">{t("smsSegmentsPerGuest")}</dt>
                  <dd className="text-right font-medium">
                    {t("smsSegmentsLabel", { count: props.preview.smsSegments })}
                  </dd>
                </div>
              )}
            </dl>
            {props.channels.includes("SMS") && (
              <div className="mt-3 rounded-xl bg-muted/50 p-3 text-sm" role="status" aria-live="polite">
                {props.smsPreflightPending ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                    {t("smsPreflightPending")}
                  </p>
                ) : props.smsPreflightError ? (
                  <p className="text-destructive">{props.smsPreflightError}</p>
                ) : props.smsPreflight ? (
                  <>
                    <p className="font-medium">
                      {t("smsPreflightSummary", {
                        count: props.smsPreflight.recipientCount,
                        segments: props.smsPreflight.maximumSegments,
                      })}
                    </p>
                    {props.smsPreflight.shortenedCount > 0 && (
                      <p className="mt-1 text-amber-900">
                        {t("smsShortenedRecipients", { count: props.smsPreflight.shortenedCount })}
                      </p>
                    )}
                    {props.smsPreflight.unsendableCount > 0 && (
                      <p className="mt-1 text-destructive">
                        {t("smsUnsendableRecipients", { count: props.smsPreflight.unsendableCount })}
                      </p>
                    )}
                    {props.smsPreflight.issues.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {props.smsPreflight.issues.map((issue) => (
                          <li key={issue.guestId}>
                            <span className="font-medium">{issue.recipientName}</span>{" — "}
                            {issue.code === "SMS_COPY_WILL_BE_SHORTENED"
                              ? t("smsCopyShortenedIssue")
                              : issue.code === "SMS_CONTACT_REQUIRED"
                                ? t("errors.invalidPhone")
                                : issue.code === "INVITATION_LINK_INVALID"
                                  ? t("errors.invalidInvitationLink")
                                  : issue.code === "SMS_RECIPIENT_DETAILS_TOO_LONG"
                                    ? t("errors.smsRecipientDetailsTooLong")
                                    : t("errors.smsTooLong")}
                          </li>
                        ))}
                        {props.smsPreflight.additionalIssueCount > 0 && (
                          <li>{t("smsMoreRecipientIssues", { count: props.smsPreflight.additionalIssueCount })}</li>
                        )}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">{t("smsPreflightPending")}</p>
                )}
              </div>
            )}
            {props.missingContactCount > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                {t("missingContacts", { count: props.missingContactCount })}
              </p>
            )}
            {props.channels.includes("SMS") && hasSmsOverLimit && (
              <p className="mt-3 rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
                {t("smsOverLimit")}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialog.Cancel className={buttonVariants({ variant: "outline" })}>
                {t("cancelSend")}
              </AlertDialog.Cancel>
              <AlertDialog.Action
                className={buttonVariants()}
                disabled={!sendAllowed || props.sendPending}
                onClick={(event) => {
                  event.preventDefault();
                  if (!sendAllowed || props.sendPending) return;
                  setConfirmOpen(false);
                  props.onConfirmSend();
                }}
              >
                {props.sendPending ? <LoaderCircle className="animate-spin" /> : <Send />}
                {t("confirmSendAction")}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
