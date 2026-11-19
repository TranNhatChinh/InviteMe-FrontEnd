"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Eye,
  HeartHandshake,
  History,
  LoaderCircle,
  Mail,
  MessageSquareText,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useLocale } from "@/i18n/language-context";
import { formatDate } from "@/i18n/format";
// eslint-disable-next-line architecture/boundaries -- AI generation quota is the shared wedding plan entitlement, separate from template workflows.
import { FeatureLimitNotice, planEntitlementState, useWeddingPlan } from "@/features/plans";
import { usePermission } from "@/shared/components/permission-guard";
import { ApiError } from "@/core/api/api-error";
import { useRuntime } from "@/core/config/runtime";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { EmptyState } from "@/shared/feedback/empty-state";
import { MessageRecipientPicker } from "@/shared/components/message-recipient-picker";
import { MAX_MESSAGE_RECIPIENTS, missingRecipientContacts } from "@/shared/lib/message-recipients";
import {
  approveThankYouTemplate,
  editThankYouTemplate,
  generateThankYouTemplateOptions,
  generateThankYouSms,
  previewThankYouSms,
  getThankYouBatch,
  listAllThankYouGuests,
  listThankYouTemplates,
  previewThankYouTemplate,
  queueThankYouTemplateMessages,
  retryThankYouBatch,
  type ThankYouTemplate,
} from "../api/thank-you.api";

type SendAttempt = { templateId: string; guestIds: string[]; channels: string[]; key: string; smsContent?: string };
type Preview = { templateId: string; version: number; guestId: string; content: string };

export function ThankYouPermissionFallback() {
  const { t } = useTranslation("thankYou");
  return (
    <EmptyState title={t("permissionDeniedTitle")} description={t("permissionDeniedDescription")} />
  );
}

function niceError(error: unknown, t: (key: string) => string) {
  if (error instanceof ApiError && error.backendCode === "AI_NOT_CONFIGURED")
    return t("errors.aiUnavailable");
  if (error instanceof ApiError && error.status === 429) return t("errors.rateLimited");
  if (error instanceof ApiError && error.status === 409) return t("errors.conflict");
  if (error instanceof ApiError && error.backendCode === "THANK_YOU_CONTACT_REQUIRED")
    return t("errors.contactRequired");
  if (error instanceof ApiError && error.backendCode === "THANK_YOU_CHANNEL_NOT_CONFIGURED")
    return t("errors.channelUnavailable");
  if (error instanceof ApiError && error.backendCode === "PLAN_LIMIT_REACHED")
    return t("errors.planLimit");
  if (error instanceof ApiError && error.backendCode === "AI_SMS_COPY_INVALID")
    return t("smsAiInvalid");
  if (error instanceof ApiError && error.backendCode === "THANK_YOU_SMS_TOO_LONG")
    return t("smsTooLong");
  if (error instanceof ApiError && error.backendCode?.startsWith("AI_"))
    return t("smsAiUnavailable");
  return t("errors.generic");
}

export function ThankYouManager({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("thankYou");
  const { t: tPlans } = useTranslation("plans");
  const { language } = useLocale();
  const { api } = useRuntime();
  const { isOwner } = usePermission();
  const plan = useWeddingPlan(weddingId);
  const client = useQueryClient();
  const [selectedGuestIds, setSelectedGuestIds] = useState<string[]>([]);
  const [includeGiftAmount, setIncludeGiftAmount] = useState(false);
  const [sendChannels, setSendChannels] = useState<string[]>(["EMAIL"]);
  const [editorChannel, setEditorChannel] = useState<"EMAIL" | "SMS">("EMAIL");
  const [smsContent, setSmsContent] = useState("Cảm ơn bạn đã dành tình cảm cho chúng mình!");
  const [smsGuestId, setSmsGuestId] = useState("");
  const [smsShownPreview, setSmsShownPreview] = useState<{ content: string; guestId: string; rendered?: { content: string; encoding: string; units: number; segments: number } } | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState("");
  const [edits, setEdits] = useState<{ id: string; content: string } | null>(null);
  const [previewGuestId, setPreviewGuestId] = useState("");
  const [previewContent, setPreviewContent] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [visibleJobs, setVisibleJobs] = useState(50);
  const [uncertainSend, setUncertainSend] = useState<SendAttempt | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preparingSend, setPreparingSend] = useState(false);
  const templateKey = ["thank-you-templates", weddingId] as const;

  const guests = useQuery({
    queryKey: ["thank-you-guests", weddingId, "all"],
    queryFn: ({ signal }) => listAllThankYouGuests(api, weddingId, signal),
    staleTime: 60_000,
  });
  const recipients = useMemo(
    () => (guests.data ?? []).map((guest) => ({ ...guest, groupName: guest.group?.name })),
    [guests.data],
  );
  const selected = useMemo(() => new Set(selectedGuestIds), [selectedGuestIds]);
  const selectedGuests = useMemo(
    () => recipients.filter((guest) => selected.has(guest.id)),
    [recipients, selected],
  );
  const templates = useQuery({
    queryKey: templateKey,
    queryFn: ({ signal }) => listThankYouTemplates(api, weddingId, signal),
  });
  const activeTemplate =
    templates.data?.items.find((template) => template.id === activeTemplateId) ??
    templates.data?.items[0];
  const content =
    edits && edits.id === activeTemplate?.id ? edits.content : (activeTemplate?.content ?? "");
  const dirty = Boolean(activeTemplate && content !== activeTemplate.content);
  const previewGuests = selectedGuests.length ? selectedGuests : recipients;
  const effectiveSmsGuest = previewGuests.some((guest) => guest.id === smsGuestId) ? smsGuestId : "";
  const recipientById = useMemo(
    () => new Map(recipients.map((guest) => [guest.id, guest])),
    [recipients],
  );
  const effectivePreviewGuest = previewGuests.some((guest) => guest.id === previewGuestId)
    ? previewGuestId
    : "";
  const currentPreview =
    previewContent?.templateId === activeTemplate?.id &&
    previewContent?.version === activeTemplate?.version
      ? previewContent
      : null;
  const batch = useQuery({
    queryKey: ["thank-you-batch", weddingId, batchId],
    queryFn: ({ signal }) => getThankYouBatch(api, weddingId, batchId, signal),
    enabled: Boolean(batchId),
    refetchInterval: (query) => (query.state.data?.pendingCount ? 2500 : false),
  });
  const smsPreview = useQuery({
    queryKey: ["thank-you-sms-preview", weddingId, selectedGuestIds, smsContent],
    queryFn: ({ signal }) => previewThankYouSms(api, weddingId, selectedGuestIds, smsContent, signal),
    enabled: (sendChannels.includes("SMS") || editorChannel === "SMS") && selectedGuestIds.length > 0 && smsContent.trim().length > 0,
    retry: false,
    staleTime: 0,
  });
  const refreshTemplates = () => client.invalidateQueries({ queryKey: templateKey });
  function showError(reason: unknown) {
    setError(niceError(reason, t));
    if (reason instanceof ApiError && reason.status === 409) setConflict(true);
  }
  const generate = useMutation({
    mutationFn: (input: { guestIds: string[]; includeGiftAmount: boolean }) =>
      generateThankYouTemplateOptions(api, weddingId, input),
    onSuccess: async (options) => {
      await Promise.all([
        refreshTemplates(),
        client.invalidateQueries({ queryKey: ["wedding-plan", weddingId] }),
      ]);
      setActiveTemplateId(options[0]?.id ?? "");
      setEdits(null);
      setPreviewContent(null);
      setError("");
      setConflict(false);
    },
    onError: async (reason) => {
      showError(reason);
      if (reason instanceof ApiError && reason.backendCode === "PLAN_LIMIT_REACHED")
        await client.invalidateQueries({ queryKey: ["wedding-plan", weddingId] });
    },
  });
  const generateSms = useMutation({
    mutationFn: () => generateThankYouSms(api, weddingId, selectedGuestIds),
    onSuccess: (result) => { setSmsContent(result.content); setError(""); },
    onError: showError,
  });
  const previewSingleSms = useMutation({
    mutationFn: ({ guestId, content }: { guestId: string; content: string }) =>
      previewThankYouSms(api, weddingId, [guestId], content),
    onSuccess: (items, input) => {
      if (items[0]) setSmsShownPreview({ content: input.content, guestId: input.guestId, rendered: items[0] });
      setError("");
    },
    onError: showError,
  });
  const save = useMutation({
    mutationFn: ({ template, value }: { template: ThankYouTemplate; value: string }) =>
      editThankYouTemplate(api, weddingId, template.id, {
        content: value,
        expectedVersion: template.version,
        includeGiftAmount: template.includesGiftAmount,
      }),
    onSuccess: async () => {
      await refreshTemplates();
      setEdits(null);
      setPreviewContent(null);
      setError("");
    },
    onError: showError,
  });
  const preview = useMutation({
    mutationFn: ({ template, guestId }: { template: ThankYouTemplate; guestId: string }) =>
      previewThankYouTemplate(api, weddingId, template.id, guestId),
    onSuccess: (result, input) => {
      setPreviewContent({
        templateId: input.template.id,
        version: input.template.version,
        guestId: input.guestId,
        content: result.renderedContent,
      });
      setError("");
    },
    onError: showError,
  });
  const send = useMutation({
    mutationFn: (attempt: SendAttempt) =>
      queueThankYouTemplateMessages(
        api,
        weddingId,
        attempt.templateId,
        attempt.guestIds,
        attempt.channels,
        attempt.key,
        attempt.smsContent,
      ),
    onSuccess: (result) => {
      setError("");
      setUncertainSend(null);
      setBatchId(result.id);
      setVisibleJobs(50);
    },
    onError: (reason) => {
      if (!(reason instanceof ApiError) || reason.code === "network" || reason.status >= 500)
        setError(t("uncertainSend"));
      else {
        setUncertainSend(null);
        setError(`${t("approvedSendFailed")} ${niceError(reason, t)}`);
      }
    },
  });
  const retry = useMutation({
    mutationFn: () => retryThankYouBatch(api, weddingId, batchId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["thank-you-batch", weddingId, batchId] }),
    onError: showError,
  });
  const busy = generate.isPending || generateSms.isPending || save.isPending || preparingSend || send.isPending;
  const locked = busy || Boolean(uncertainSend);
  const planUnavailable = plan.isError || (!plan.isPending && !plan.data);
  const generationGate =
    !planUnavailable && plan.data ? planEntitlementState(plan.data, "aiThankYouRuns") : null;
  const aiQuotaText =
    !planUnavailable && plan.data
      ? plan.data.legacy || plan.data.limits.aiThankYouRuns === null
        ? t("unlimitedAiQuota")
        : t("aiQuotaRemaining", {
            remaining: Math.max(
              0,
              plan.data.limits.aiThankYouRuns - plan.data.usage.aiThankYouRuns,
            ),
            limit: plan.data.limits.aiThankYouRuns,
          })
      : null;
  const missingContacts = missingRecipientContacts(recipients, selectedGuestIds, sendChannels);
  const canSend =
    Boolean(activeTemplate) &&
    !conflict &&
    !locked &&
    guests.isSuccess &&
    selectedGuestIds.length > 0 &&
    selectedGuestIds.length <= MAX_MESSAGE_RECIPIENTS &&
    sendChannels.length > 0 &&
    (!sendChannels.includes("SMS") || (Boolean(smsContent.trim()) && !smsPreview.isFetching && smsPreview.isSuccess && smsPreview.data.length === selectedGuestIds.length && smsPreview.data.every((item) => item.hasPhone && item.segments <= 3))) &&
    !missingContacts.length;

  function selectTemplate(template: ThankYouTemplate) {
    if (dirty && !window.confirm(t("discardEdits"))) return;
    setActiveTemplateId(template.id);
    setEdits(null);
    setPreviewContent(null);
    setError("");
    setConflict(false);
  }
  async function confirmAndSend() {
    if (!canSend || !activeTemplate) return;
    const attempt = {
      templateId: activeTemplate.id,
      guestIds: [...selectedGuestIds],
      channels: [...sendChannels],
      key: crypto.randomUUID(),
      smsContent: sendChannels.includes("SMS") ? smsContent : undefined,
    };
    setPreparingSend(true);
    setError("");
    try {
      let template = activeTemplate;
      if (dirty) {
        template = await editThankYouTemplate(api, weddingId, template.id, {
          content,
          expectedVersion: template.version,
          includeGiftAmount: template.includesGiftAmount,
        });
        setEdits(null);
      }
      if (template.status === "DRAFT") {
        await approveThankYouTemplate(api, weddingId, template.id, template.version);
      }
      await refreshTemplates();
      setConfirmOpen(false);
      setUncertainSend(attempt);
      send.mutate(attempt);
    } catch (reason) {
      await refreshTemplates();
      setConfirmOpen(false);
      if (!(reason instanceof ApiError) || reason.code === "network" || reason.status >= 500) {
        setError(t("approvalUncertain"));
      } else {
        showError(reason);
      }
    } finally {
      setPreparingSend(false);
    }
  }
  async function reloadTemplate() {
    if (dirty && !window.confirm(t("discardEdits"))) return;
    const result = await templates.refetch();
    if (!result.isError) {
      setEdits(null);
      setPreviewContent(null);
      setConflict(false);
      setError("");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary-hover">
            <HeartHandshake className="size-3.5" />
            {t("sharedBadge")}
          </span>
          <h1 className="font-display text-3xl sm:text-4xl">{t("title")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("description")}</p>
        </div>
        <a
          href="#thank-you-recipients"
          className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted"
        >
          <Users className="size-4 text-primary-hover" />
          <span>{t("recipientAction")}</span>
          <span className="border-l pl-2 font-medium">
            {t("audienceCount", { count: selectedGuestIds.length })}
          </span>
        </a>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
          {conflict && (
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => void reloadTemplate()}
            >
              <RefreshCw />
              {t("reloadTemplate")}
            </Button>
          )}
        </div>
      )}
      {plan.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("checkingPlan")}
        </p>
      )}
      {planUnavailable && (
        <FeatureLimitNotice
          status="unavailable"
          title={t("planUnknownTitle")}
          description={t("planUnknownDescription")}
          variant="compact"
          retryLabel={tPlans("gate.retry")}
          onRetry={() => void plan.refetch()}
        />
      )}
      {generationGate?.locked && (
        <FeatureLimitNotice
          title={t("aiQuotaReachedTitle")}
          description={
            isOwner ? t("aiQuotaReachedOwnerDescription") : t("aiQuotaReachedContactOwner")
          }
          usage={aiQuotaText ?? undefined}
          variant="compact"
          upgradeHref={isOwner ? `/weddings/${encodeURIComponent(weddingId)}/plan` : undefined}
          upgradeLabel={isOwner ? tPlans("gate.viewPlans") : undefined}
        />
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.9fr)]">
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="border-b p-4 sm:px-6">
            <div role="group" aria-label={t("composeChannel")} className="inline-flex w-full rounded-xl bg-muted/50 p-1 sm:w-auto">
              {(["EMAIL", "SMS"] as const).map((channel) => (
                <button key={channel} type="button" aria-pressed={editorChannel === channel} onClick={() => setEditorChannel(channel)} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors sm:flex-none ${editorChannel === channel ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {channel === "EMAIL" ? <Mail className="size-4" /> : <MessageSquareText className="size-4" />}
                  {channel === "EMAIL" ? "Email" : "SMS"}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("composeChannelHint")}</p>
          </div>
          <div hidden={editorChannel !== "EMAIL"}>
          <div className="border-b bg-muted/30 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl">{t("composeTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("composeDescription")}</p>
              </div>
              <Button
                type="button"
                disabled={
                  locked ||
                  conflict ||
                  plan.isPending ||
                  planUnavailable ||
                  Boolean(generationGate?.locked)
                }
                onClick={() => {
                  if (planUnavailable || !plan.data || generationGate?.locked) return;
                  if (dirty && !window.confirm(t("discardEdits"))) return;
                  generate.mutate({ guestIds: [...selectedGuestIds], includeGiftAmount });
                }}
              >
                {generate.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                {generate.isPending
                  ? t("generating")
                  : activeTemplate
                    ? t("generateAgain")
                    : t("generateButton")}
              </Button>
            </div>
            {aiQuotaText && (
              <p className="mt-3 text-xs text-muted-foreground" role="status">
                {aiQuotaText}
              </p>
            )}
            <details className="mt-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground">
                {t("contentOptions")}
                {includeGiftAmount && (
                  <span className="text-primary-hover">{t("giftOptionEnabled")}</span>
                )}
                <ChevronDown className="size-3.5" />
              </summary>
              <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-primary-hover"
                  checked={includeGiftAmount}
                  disabled={locked}
                  onChange={(event) => setIncludeGiftAmount(event.target.checked)}
                />
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {t("includeGiftAmount")}
                </span>
              </label>
            </details>
          </div>
          <div className="space-y-5 p-5 sm:p-6">
            {templates.isPending ? (
              <p role="status" className="py-12 text-center text-sm text-muted-foreground">
                {t("loadingTemplates")}
              </p>
            ) : templates.isError ? (
              <div role="alert" className="text-sm text-destructive">
                <p>{t("templatesFailed")}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  onClick={() => void templates.refetch()}
                >
                  {t("reloadTemplate")}
                </Button>
              </div>
            ) : activeTemplate ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${activeTemplate.status === "APPROVED" ? "bg-primary/20 text-primary-hover" : "bg-muted text-muted-foreground"}`}
                    >
                      {activeTemplate.status === "APPROVED" && <ShieldCheck className="size-3.5" />}
                      {t(`statuses.${activeTemplate.status}`)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("version", { version: activeTemplate.version })}
                    </span>
                  </div>
                  {activeTemplate.usedFallback && (
                    <span className="text-xs text-muted-foreground">{t("fallback")}</span>
                  )}
                </div>
                <div className="rounded-xl border bg-background/40 p-4 text-sm leading-8" aria-label={t("templateContent")}>
                  {content.split(/(\{\{GuestName\}\}|\{\{GiftThanks\}\})/).map((part, index, parts) =>
                    part === "{{GuestName}}" || part === "{{GiftThanks}}" ? (
                      <span key={index} className="inline-block rounded-md bg-primary/15 px-2 text-xs font-medium text-primary-hover">
                        {t(part === "{{GuestName}}" ? "guestNameLabel" : "giftThanksLabel")}
                      </span>
                    ) : (
                      <textarea
                        key={index}
                        aria-label={t("letterPart", { number: Math.floor(index / 2) + 1 })}
                        className="block min-h-12 w-full resize-y border-0 bg-transparent p-0 text-sm leading-8 focus:outline-none focus:ring-0"
                        rows={Math.max(1, Math.min(12, part.split("\n").length + Math.floor(part.length / 90)))}
                        value={part}
                        readOnly={activeTemplate.status === "APPROVED" || locked}
                        onChange={(event) => {
                          const next = [...parts];
                          next[index] = event.target.value;
                          setEdits({ id: activeTemplate.id, content: next.join("") });
                          setPreviewContent(null);
                        }}
                      />
                    ),
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{t("personalizationHint")}</span>
                  <span>{content.length}/3.000</span>
                </div>
                {activeTemplate.includesGiftAmount && (
                  <p className="rounded-xl bg-muted p-3 text-xs leading-relaxed text-muted-foreground">{t("giftPlaceholderHint")}</p>
                )}
                {activeTemplate.status === "DRAFT" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!dirty || locked || conflict}
                      onClick={() => save.mutate({ template: activeTemplate, value: content })}
                    >
                      {save.isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
                      {t("saveChanges")}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {t("approvalOnSend")}
                    </span>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 rounded-xl bg-primary/10 p-3 text-sm text-primary-hover">
                    <Check className="size-4 shrink-0" />
                    {t("approvedReusable")}
                  </p>
                )}
                <div className="border-t pt-5">
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <Eye className="size-4 text-primary-hover" />
                    {t("previewTitle")}
                  </h3>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <select
                      className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm"
                      aria-label={t("previewGuest")}
                      value={effectivePreviewGuest}
                      disabled={locked}
                      onChange={(event) => {
                        setPreviewGuestId(event.target.value);
                        setPreviewContent(null);
                      }}
                    >
                      <option value="">{t("illustrativeGuest")}</option>
                      {previewGuests.map((guest) => (
                        <option key={guest.id} value={guest.id}>
                          {guest.recipientName}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        dirty || locked || conflict || preview.isPending
                      }
                      onClick={() => {
                        if (effectivePreviewGuest) {
                          preview.mutate({ template: activeTemplate, guestId: effectivePreviewGuest });
                        } else {
                          setPreviewContent({
                            templateId: activeTemplate.id,
                            version: activeTemplate.version,
                            guestId: "",
                            content: activeTemplate.content
                              .replaceAll("{{GuestName}}", t("illustrativeGuest"))
                              .replaceAll("{{GiftThanks}}", ""),
                          });
                        }
                      }}
                    >
                      {preview.isPending ? <LoaderCircle className="animate-spin" /> : <Eye />}
                      {t("preview")}
                    </Button>
                  </div>
                  {currentPreview && !dirty && (
                    <div
                      aria-live="polite"
                      className="mt-4 whitespace-pre-wrap rounded-xl border border-primary/20 bg-muted/30 p-5 text-sm leading-8"
                    >
                      {!currentPreview.guestId && <p className="mb-2 text-xs font-medium text-primary-hover">{t("illustrativePreview")}</p>}
                      {currentPreview.content}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-xl bg-muted/20 px-6 py-10 text-center">
                <HeartHandshake className="mb-4 size-10 text-primary-hover/60" />
                <h3 className="font-display text-xl">{t("emptyTitle")}</h3>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {t("emptyTemplates")}
                </p>
              </div>
            )}
            {templates.data && templates.data.items.length > 1 && (
              <details className="border-t pt-4">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
                  <History className="size-4 text-muted-foreground" />
                  {t("savedTemplates", { count: templates.data.items.length })}
                  <ChevronDown className="ml-auto size-4" />
                </summary>
                <div className="mt-3 grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">
                  {templates.data.items.map((template) => (
                    <button
                      type="button"
                      key={template.id}
                      disabled={locked}
                      onClick={() => selectTemplate(template)}
                      className={`rounded-xl border p-3 text-left transition-colors hover:bg-muted/40 ${template.id === activeTemplate?.id ? "border-primary bg-primary/10" : ""}`}
                    >
                      <span className="block text-xs font-medium text-primary-hover">
                        {t(`statuses.${template.status}`)} ·{" "}
                        {formatDate(template.createdAt, language, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                        {template.content.replaceAll("{{GuestName}}", t("guestNameLabel")).replaceAll("{{GiftThanks}}", t("giftThanksLabel"))}
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
          </div>
            {editorChannel === "SMS" && (
              <div>
                <div className="border-b bg-muted/30 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h2 className="font-display text-2xl">{t("smsTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("smsComposeDescription")}</p></div>
                  <Button type="button" disabled={locked || plan.isPending || planUnavailable || Boolean(generationGate?.locked)} onClick={() => generateSms.mutate()}>
                    {generateSms.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{t("smsGenerate")}
                  </Button>
                  </div>
                  {aiQuotaText && <p className="mt-3 text-xs text-muted-foreground">{aiQuotaText}</p>}
                </div>
                <div className="space-y-4 p-5 sm:p-6">
                <label htmlFor="thank-you-sms" className="text-sm font-medium">{t("smsTitle")}</label>
                <textarea id="thank-you-sms" value={smsContent} maxLength={500} disabled={locked} onChange={(event) => { setSmsContent(event.target.value); setSmsShownPreview(null); }} className="min-h-24 w-full rounded-xl border bg-background p-3 text-sm" />
                <p className="text-right text-xs text-muted-foreground">{t("smsDraftLength", { count: smsContent.length })}</p>
                <p className="text-xs text-muted-foreground">{t("smsHint")}</p>
                <div className="border-t pt-4">
                  <h3 className="flex items-center gap-2 text-sm font-medium"><Eye className="size-4 text-primary-hover" />{t("smsPreviewTitle")}</h3>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <select aria-label={t("smsPreviewGuest")} className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm" value={effectiveSmsGuest} disabled={locked} onChange={(event) => { setSmsGuestId(event.target.value); setSmsShownPreview(null); }}>
                      <option value="">{t("illustrativeGuest")}</option>
                      {previewGuests.map(guest => <option key={guest.id} value={guest.id}>{guest.recipientName}</option>)}
                    </select>
                    <Button type="button" variant="outline" disabled={locked || !smsContent.trim() || previewSingleSms.isPending} onClick={() => { if (effectiveSmsGuest) previewSingleSms.mutate({ guestId: effectiveSmsGuest, content: smsContent }); else setSmsShownPreview({ content: smsContent, guestId: "" }); }}>{previewSingleSms.isPending ? <LoaderCircle className="animate-spin" /> : <Eye />}{t("preview")}</Button>
                  </div>
                  {smsPreview.isFetching && <p role="status" className="mt-2 text-xs">{t("smsChecking")}</p>}
                  {smsPreview.isError && <p role="alert" className="mt-2 text-xs text-destructive">{t("smsPreviewError")}</p>}
                  {smsShownPreview && smsShownPreview.content === smsContent && smsShownPreview.guestId === effectiveSmsGuest && (() => {
                    const item = smsShownPreview.rendered;
                    return <div className="mt-4 whitespace-pre-wrap break-words rounded-xl border border-primary/20 bg-muted/30 p-5 text-sm leading-7">{!effectiveSmsGuest && <p className="mb-2 text-xs font-medium text-primary-hover">{t("illustrativePreview")}</p>}{item?.content ?? `${t("illustrativeGuest")} ${t("smsIllustrativeGreeting")} ${smsContent}\n— ${t("smsWeddingTitle")}`} {item && <p className="mt-2 text-xs">{item.encoding} · {item.units} · {t("smsSegments", { count: item.segments })}</p>}</div>;
                  })()}
                  {smsPreview.data?.some(item => item.segments > 3 || !item.hasPhone) && <p role="alert" className="mt-2 text-xs text-destructive">{t("smsInvalidGuests", { names: smsPreview.data.filter(item => item.segments > 3 || !item.hasPhone).map(item => item.guestName).join(", ") })}</p>}
                </div>
                </div>
              </div>
            )}
        </section>
        <aside className="space-y-5 xl:sticky xl:top-6">
          <section
            id="thank-you-recipients"
            className="scroll-mt-20 rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
          >
            <h2 className="mb-1 font-display text-xl">{t("recipientsTitle")}</h2>
            <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
              {t("recipientsDescription")}
            </p>
            <MessageRecipientPicker
              recipients={recipients}
              selectedIds={selectedGuestIds}
              onChange={setSelectedGuestIds}
              loading={guests.isPending}
              failed={guests.isError}
              onRetry={() => void guests.refetch()}
              disabled={locked}
            />
          </section>
          <section className="rounded-2xl border border-primary/30 bg-card p-5 shadow-sm sm:p-6">
            <h2 className="font-display text-xl">{t("sendStepTitle")}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t("sendStepDescription")}
            </p>
            <fieldset className="mt-4">
              <legend className="sr-only">{t("channelsLabel")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["EMAIL", "SMS"] as const).map((channel) => (
                  <label
                    key={channel}
                    className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${sendChannels.includes(channel) ? "border-primary bg-primary/10" : "bg-background"}`}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary-hover"
                      checked={sendChannels.includes(channel)}
                      disabled={locked}
                      onChange={() =>
                        setSendChannels((current) =>
                          current.includes(channel)
                            ? current.filter((item) => item !== channel)
                            : [...current, channel],
                        )
                      }
                    />
                    {channel === "EMAIL" ? (
                      <Mail className="size-4" />
                    ) : (
                      <MessageSquareText className="size-4" />
                    )}
                    {channel === "EMAIL" ? "Email" : "SMS"}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="my-4 flex items-center justify-between border-y py-3 text-sm">
              <span className="text-muted-foreground">{t("recipientSummary")}</span>
              <strong>{t("audienceCount", { count: selectedGuestIds.length })}</strong>
            </div>
            {missingContacts.length > 0 && (
              <div
                role="alert"
                className="mb-3 rounded-lg bg-destructive/5 p-3 text-xs leading-relaxed text-destructive"
              >
                {t("missingContacts", { count: missingContacts.length })}
                <button
                  type="button"
                  disabled={locked}
                  className="mt-2 block font-medium underline underline-offset-4"
                  onClick={() => {
                    const missing = new Set(missingContacts);
                    setSelectedGuestIds((ids) => ids.filter((id) => !missing.has(id)));
                  }}
                >
                  {t("removeMissingContacts", { count: missingContacts.length })}
                </button>
              </div>
            )}
            {uncertainSend && (
              <div
                role="status"
                className="mb-3 space-y-3 rounded-xl bg-muted p-3 text-xs leading-relaxed"
              >
                <p>{t("uncertainSend")}</p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={send.isPending}
                  onClick={() => send.mutate(uncertainSend)}
                >
                  {send.isPending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                  {t("retrySameRequest")}
                </Button>
              </div>
            )}
            <Button type="button" className="w-full" disabled={!canSend} onClick={() => setConfirmOpen(true)}>
              {send.isPending || preparingSend ? <LoaderCircle className="animate-spin" /> : <Send />}
              {send.isPending || preparingSend ? t("queueing") : t("sendButton", { count: selectedGuestIds.length })}
            </Button>
            {!activeTemplate && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {sendChannels.includes("SMS") ? t("smsNeedsLetter") : t("approveBeforeSend")}
              </p>
            )}
          </section>
        </aside>
      </div>
      <Modal open={confirmOpen} onClose={() => { if (!preparingSend) setConfirmOpen(false); }} title={t("reviewSendTitle")} description={t("reviewSendDescription")}>
        <div className="space-y-4">
          <p className="text-sm">{t("confirmSend", { count: selectedGuestIds.length, channels: sendChannels.join(" + ") })}</p>
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-muted/30 p-4 text-sm leading-7">
            {content.replaceAll("{{GuestName}}", t("illustrativeGuest")).replaceAll("{{GiftThanks}}", t("giftThanksPreview"))}
          </div>
          <p className="text-xs text-muted-foreground">{t("reviewPersonalization")}</p>
          {sendChannels.includes("SMS") && smsPreview.data && <div className="rounded-xl border p-3 text-sm"><strong>{t("smsTitle")}</strong><p className="mt-2 whitespace-pre-wrap break-all">{(smsPreview.data.find(x => x.guestId === smsGuestId) ?? smsPreview.data[0])?.content}</p><p className="mt-2 text-xs">{t("smsMaxSegments", { count: Math.max(...smsPreview.data.map(x => x.segments)) })}</p></div>}
          <div className="max-h-28 overflow-y-auto rounded-xl border p-3 text-sm">{selectedGuests.map((guest) => guest.recipientName).join(", ")}</div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={preparingSend} onClick={() => setConfirmOpen(false)}>{t("cancelSend")}</Button>
            <Button type="button" disabled={preparingSend} onClick={() => void confirmAndSend()}>{preparingSend ? <LoaderCircle className="animate-spin" /> : <Send />}{t("confirmApproveAndSend")}</Button>
          </div>
        </div>
      </Modal>
      {batchId && (
        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl">{t("deliveryStatus")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {batch.data
                  ? t(`statuses.${batch.data.status}`, { defaultValue: batch.data.status })
                  : t("queued")}
              </p>
            </div>
            {Boolean(batch.data?.failedCount) && (
              <Button
                type="button"
                variant="outline"
                disabled={retry.isPending}
                onClick={() => retry.mutate()}
              >
                <RefreshCw className={retry.isPending ? "animate-spin" : ""} />
                {t("retryFailed")}
              </Button>
            )}
          </div>
          {batch.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("loadingProgress")}
            </p>
          ) : batch.isError ? (
            <div role="alert">
              <p className="text-sm text-destructive">{niceError(batch.error, t)}</p>
              <Button type="button" variant="outline" onClick={() => void batch.refetch()}>
                {t("reloadTemplate")}
              </Button>
            </div>
          ) : (
            batch.data && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  {[
                    ["sentCount", batch.data.sentCount],
                    ["acceptedCount", batch.data.acceptedCount ?? 0],
                    ["deliveredCount", batch.data.deliveredCount ?? 0],
                    ["failedCount", batch.data.failedCount],
                    ["pendingCount", batch.data.pendingCount],
                    ["unknownCount", batch.data.unknownCount ?? 0],
                    ["simulatedCount", batch.data.simulatedCount ?? 0],
                  ].map(([key, count]) => (
                    <div key={String(key)} className="rounded-xl bg-muted/40 px-4 py-3 text-sm">
                      {t(String(key), { count })}
                    </div>
                  ))}
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-primary-hover">
                    {t("deliveryDetails", { count: batch.data.jobs.length })}
                  </summary>
                  <div className="mt-3 max-h-80 divide-y overflow-y-auto rounded-xl border">
                    {batch.data.jobs.slice(0, visibleJobs).map((job) => (
                      <div
                        key={job.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                      >
                        <span className="min-w-0 break-all">
                          {recipientById.get(job.guestId)?.recipientName ?? job.recipient}
                          <span className="ml-2 text-xs text-muted-foreground">{job.channel}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t(`statuses.${job.status}`, { defaultValue: job.status })}
                        </span>
                      </div>
                    ))}
                  </div>
                  {batch.data.jobs.length > visibleJobs && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-3"
                      onClick={() => setVisibleJobs((count) => count + 50)}
                    >
                      {t("loadMore")}
                    </Button>
                  )}
                </details>
                <p className="text-xs leading-relaxed text-muted-foreground">{t("deliveryHint")}</p>
              </>
            )
          )}
        </section>
      )}
    </div>
  );
}
