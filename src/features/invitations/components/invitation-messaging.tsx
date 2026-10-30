"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  Mail,
  MessageSquareText,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { ApiError } from "@/core/api/api-error";
import { useRuntime } from "@/core/config/runtime";
import { Button } from "@/shared/ui/button";
import { usePermission } from "@/shared/components/permission-guard";
import {
  generateInvitationDraft,
  getInvitationBatch,
  getInvitationDraft,
  previewInvitation,
  queueInvitationBatch,
  retryInvitationBatch,
  saveInvitationDraft,
  sendTestInvitation,
  type InvitationChannel,
  type InvitationDraft,
  type InvitationSendBody,
} from "../api/invitation-messaging.api";
import { MessageRecipientPicker } from "@/shared/components/message-recipient-picker";
import {
  loadAllMessageRecipients,
  MAX_MESSAGE_RECIPIENTS,
  missingRecipientContacts,
} from "@/shared/lib/message-recipients";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { countSmsSegments } from "../utils/sms-segments";

const recipientSchema = z.object({
  id: z.string(),
  recipientName: z.string(),
  group: z.object({ id: z.string(), name: z.string() }).nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable().optional(),
});
const guestPageSchema = z.object({
  items: z.array(recipientSchema),
  page: z.number(),
  pageSize: z.number(),
  totalItems: z.number(),
});
const batchKey = (weddingId: string) => `inviteme:last-invitation-batch:${weddingId}`;
const draftKey = (weddingId: string) => ["invitation-messaging", weddingId, "draft"] as const;
const batchQueryKey = (weddingId: string, id: string) =>
  ["invitation-messaging", weddingId, "batch", id] as const;
const batchChangeEvent = "inviteme:invitation-batch-change";

function useStoredBatchId(weddingId: string) {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      window.addEventListener(batchChangeEvent, onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(batchChangeEvent, onChange);
      };
    },
    () => window.localStorage.getItem(batchKey(weddingId)) ?? "",
    () => "",
  );
}

function persistBatchId(weddingId: string, id: string) {
  window.localStorage.setItem(batchKey(weddingId), id);
  window.dispatchEvent(new Event(batchChangeEvent));
}

function friendlyError(error: unknown, t: (key: string) => string): string {
  if (!(error instanceof ApiError)) return t("errors.generic");
  if (error.status === 503 || error.backendCode === "INVITATION_CHANNEL_NOT_CONFIGURED")
    return t("errors.channelNotConfigured");
  if (["SMS_PHONE_INVALID", "GUEST_PHONE_INVALID", "TEXTBEE_RECIPIENT_INVALID"].includes(error.backendCode ?? "")) return t("errors.invalidPhone");
  if (["TEXTBEE_NOT_CONFIGURED", "TEXTBEE_AUTH_FAILED", "TEXTBEE_ACCESS_DENIED", "TEXTBEE_DEVICE_NOT_FOUND"].includes(error.backendCode ?? "")) return t("errors.providerNotConfigured");
  if (error.backendCode === "SMS_CONTENT_TOO_LONG") return t("errors.smsTooLong");
  if (error.backendCode === "CONCURRENCY_CONFLICT" || error.status === 409)
    return t("errors.conflict");
  if (error.status === 422) return t("errors.invalidRequest");
  if (error.status === 404) return t("errors.notFound");
  return t("errors.generic");
}

function validateTemplate(
  subject: string,
  content: string,
  smsContent: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const errors: string[] = [];
  if (!subject.trim() || subject.length > 200 || /[\r\n]/.test(subject))
    errors.push(t("validation.subject"));
  if (!content.trim() || content.length > 10000) errors.push(t("validation.emailLength"));
  if (
    /\{\{|\}\}|https?:\/\/|<[^>]*>|\bQR\b|mã QR|(?:đường )?link\s+(?:ở\s*)?bên dưới/i.test(content)
  )
    errors.push(t("validation.emailCopyRules"));
  if (!smsContent.trim() || smsContent.length > 10000) errors.push(t("validation.smsLength"));
  if (/\{\{|\}\}|https?:\/\/|<[^>]*>|\bQR\b|mã QR/i.test(smsContent))
    errors.push(t("validation.smsCopyRules"));
  return [...new Set(errors)];
}

function maskRecipient(value: string) {
  const at = value.indexOf("@");
  if (at > 0) return `${value.slice(0, 1)}***${value.slice(at)}`;
  return value.length > 4 ? `${value.slice(0, 2)}••••${value.slice(-2)}` : "••••";
}

function statusLabel(status: string, t: (key: string) => string) {
  const statusKeys: Record<string, string> = {
    PENDING: "status.pending",
    SENDING: "status.sending",
    SENT: "status.sent",
    FAILED: "status.failed",
    PARTIAL_FAILED: "status.partialFailed",
    ACCEPTED: "status.accepted",
    DELIVERED: "status.delivered",
    UNKNOWN: "status.unknown",
    REVIEW_REQUIRED: "status.reviewRequired",
    NEEDS_REVIEW: "status.reviewRequired",
    SIMULATED: "status.simulated",
    COMPLETED: "status.completed",
  };
  return statusKeys[status] ? t(statusKeys[status]) : status;
}

export function InvitationMessaging({
  weddingId,
  isPublished,
}: {
  weddingId: string;
  isPublished: boolean;
}) {
  const { t } = useTranslation("invitations");
  const { api } = useRuntime();
  const { can } = usePermission();
  const canViewGuests = can("GUEST_VIEW");
  const queryClient = useQueryClient();
  const draftQuery = useQuery({
    queryKey: draftKey(weddingId),
    queryFn: ({ signal }) => getInvitationDraft(api, weddingId, signal),
  });
  const [edits, setEdits] = useState<{
    subject: string;
    content: string;
    smsContent: string;
    version: number;
  } | null>(null);
  const [instructions, setInstructions] = useState("");
  const [conflictDraft, setConflictDraft] = useState<InvitationDraft | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [previewGuestId, setPreviewGuestId] = useState("");
  const [previewTab, setPreviewTab] = useState<"EMAIL" | "SMS">("EMAIL");
  const [recipientMode, setRecipientMode] = useState<"GUESTS" | "GROUP">("GUESTS");
  const [groupId, setGroupId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [channels, setChannels] = useState<InvitationChannel[]>(["EMAIL"]);
  const activeBatchId = useStoredBatchId(weddingId);
  const [showRecipients, setShowRecipients] = useState(false);
  const [visibleJobs, setVisibleJobs] = useState(50);
  const [uncertainSend, setUncertainSend] = useState<{
    body: InvitationSendBody;
    key: string;
  } | null>(null);

  const form = edits ??
    draftQuery.data ?? {
      subject: "",
      content: "",
      smsContent: "",
      version: 0,
      weddingId,
      usedFallback: false,
      smsUsedFallback: false,
    };
  const dirty = edits !== null;

  const recipientsQuery = useQuery({
    queryKey: ["invitation-messaging", weddingId, "all-recipients"],
    queryFn: ({ signal }) =>
      loadAllMessageRecipients((page) =>
        api.request(
          `/weddings/${encodeURIComponent(weddingId)}/guest-planning/guests?${new URLSearchParams({ page: String(page), pageSize: "100", archivedOnly: "false" })}`,
          { signal, schema: guestPageSchema },
        ),
      ),
    staleTime: 60_000,
    enabled: canViewGuests,
  });
  const allRecipients = useMemo(
    () =>
      (recipientsQuery.data ?? []).map((guest) => ({
        ...guest,
        groupName: guest.group?.name,
      })),
    [recipientsQuery.data],
  );
  const groups = useMemo(() => {
    const unique = new Map<string, string>();
    for (const guest of recipientsQuery.data ?? [])
      if (guest.group?.id) unique.set(guest.group.id, guest.group.name);
    return [...unique].map(([id, name]) => ({ id, name }));
  }, [recipientsQuery.data]);

  const previewQuery = useQuery({
    queryKey: ["invitation-messaging", weddingId, "preview", previewGuestId],
    queryFn: () => previewInvitation(api, weddingId, previewGuestId),
    enabled: Boolean(canViewGuests && previewGuestId && draftQuery.data),
    retry: false,
  });
  const generateMutation = useMutation({
    mutationFn: () =>
      generateInvitationDraft(api, weddingId, {
        ...(instructions.trim() ? { additionalInstructions: instructions.trim() } : {}),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(draftKey(weddingId), next);
      setEdits(null);
      setConflictDraft(null);
      setSaveMessage(t("aiDraftSaved"));
    },
  });
  const saveMutation = useMutation({
    mutationFn: (input: {
      subject: string;
      content: string;
      smsContent: string;
      version: number;
    }) =>
      saveInvitationDraft(api, weddingId, {
        subject: input.subject,
        content: input.content,
        smsContent: input.smsContent,
        expectedVersion: input.version,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(draftKey(weddingId), next);
      setEdits(null);
      setConflictDraft(null);
      setSaveMessage(t("draftSaved"));
    },
    onError: async (error) => {
      setSaveMessage(friendlyError(error, t));
      if (error instanceof ApiError && error.status === 409) {
        const latest = await queryClient.fetchQuery({
          queryKey: draftKey(weddingId),
          queryFn: ({ signal }) => getInvitationDraft(api, weddingId, signal),
        });
        if (latest) setConflictDraft(latest);
      }
    },
  });
  const testMutation = useMutation({
    mutationFn: () => sendTestInvitation(api, weddingId, previewGuestId),
  });
  const sendMutation = useMutation({
    mutationFn: (attempt: { body: InvitationSendBody; key: string }) =>
      queueInvitationBatch(api, weddingId, attempt.body, attempt.key),
    onSuccess: (batch) => {
      setUncertainSend(null);
      persistBatchId(weddingId, batch.id);
      setVisibleJobs(50);
      void queryClient.invalidateQueries({ queryKey: batchQueryKey(weddingId, batch.id) });
    },
    onError: (error) => {
      if (!(error instanceof ApiError) || error.code === "network") {
        setSaveMessage(t("uncertainSend"));
      } else {
        setUncertainSend(null);
        setSaveMessage(friendlyError(error, t));
      }
    },
  });
  const batchQuery = useQuery({
    queryKey: batchQueryKey(weddingId, activeBatchId),
    queryFn: ({ signal }) => getInvitationBatch(api, weddingId, activeBatchId, signal),
    enabled: Boolean(activeBatchId),
    refetchInterval: (query) => (query.state.data?.pendingCount ? 3000 : false),
    retry: false,
  });
  const retryMutation = useMutation({
    mutationFn: () => retryInvitationBatch(api, weddingId, activeBatchId),
    onSuccess: () => void batchQuery.refetch(),
  });

  const { subject, content, smsContent } = form;
  const templateErrors = validateTemplate(subject, content, smsContent, t);
  const recipientIds =
    recipientMode === "GROUP"
      ? (recipientsQuery.data ?? [])
          .filter((guest) => guest.group?.id === groupId)
          .map((guest) => guest.id)
      : selectedIds;
  const missingContacts = missingRecipientContacts(allRecipients, recipientIds, channels);
  const selectionCount = recipientIds.length;
  const canSend = Boolean(
    draftQuery.data &&
    isPublished &&
    canViewGuests &&
    selectionCount > 0 &&
    selectionCount <= MAX_MESSAGE_RECIPIENTS &&
    recipientsQuery.isSuccess &&
    templateErrors.length === 0 &&
    channels.length &&
    !dirty &&
    !generateMutation.isPending &&
    !saveMutation.isPending &&
    !conflictDraft &&
    !missingContacts.length &&
    !uncertainSend &&
    !sendMutation.isPending,
  );

  function updateField<K extends "subject" | "content" | "smsContent">(
    key: K,
    value: (typeof form)[K],
  ) {
    setEdits((current) => ({
      subject: current?.subject ?? form.subject,
      content: current?.content ?? form.content,
      smsContent: current?.smsContent ?? form.smsContent,
      version: current?.version ?? form.version,
      [key]: value,
    }));
    setSaveMessage("");
  }
  function beginSend() {
    if (!canSend) return;
    const details =
      recipientMode === "GROUP"
        ? t("selectedGroup", {
            name: groups.find((group) => group.id === groupId)?.name ?? t("selected"),
          })
        : t("selectedGuestCount", { count: selectedIds.length });
    if (!window.confirm(t("confirmSend", { channels: channels.join(" + "), details }))) return;
    const body: InvitationSendBody =
      recipientMode === "GROUP"
        ? { groupId, channels: [...channels] }
        : { guestIds: [...selectedIds], channels: [...channels] };
    const attempt = { body, key: window.crypto.randomUUID() };
    setUncertainSend(attempt);
    sendMutation.mutate(attempt);
  }
  function restoreLatest() {
    if (!conflictDraft) return;
    queryClient.setQueryData(draftKey(weddingId), conflictDraft);
    setEdits(null);
    setConflictDraft(null);
    setSaveMessage(t("latestLoaded"));
  }
  function retryOnLatest() {
    if (!conflictDraft) return;
    queryClient.setQueryData(draftKey(weddingId), conflictDraft);
    setEdits((current) => ({
      subject: current?.subject ?? subject,
      content: current?.content ?? content,
      smsContent: current?.smsContent ?? smsContent,
      version: conflictDraft.version,
    }));
    setConflictDraft(null);
    setSaveMessage(t("keepEditsOnNewVersion"));
  }

  if (draftQuery.isPending)
    return <div className="p-8 text-sm text-muted-foreground">{t("loadingDraft")}</div>;
  if (draftQuery.isError)
    return (
      <section role="alert" className="rounded-xl border p-5">
        <p>{friendlyError(draftQuery.error, t)}</p>
        <Button className="mt-3" variant="outline" onClick={() => void draftQuery.refetch()}>
          {t("reload")}
        </Button>
      </section>
    );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="mt-2 font-display text-2xl">{t("composeTitle")}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t("composeDescription")}
            </p>
          </div>
          {draftQuery.data && (
            <span className="rounded-full bg-muted px-3 py-1 text-xs">
              {t("version", { version: draftQuery.data.version })}
            </span>
          )}
        </div>
        {!draftQuery.data && (
          <div className="mt-5 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {t("noDraft")}
          </div>
        )}
        {!canViewGuests && (
          <p
            role="note"
            className="mt-4 rounded-xl border border-amber-500/40 bg-amber-50 p-4 text-sm text-amber-950"
          >
            {t("guestViewRequired")}
          </p>
        )}
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <label className="block space-y-2 text-sm font-medium">
              {t("aiInstructions")}{" "}
              <span className="font-normal text-muted-foreground">({instructions.length}/500)</span>
              <textarea
                className="min-h-20 w-full rounded-lg border bg-background p-3 font-normal"
                maxLength={500}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder={t("aiInstructionsPlaceholder")}
              />
            </label>
            <Button
              onClick={() => {
                if (dirty && !window.confirm(t("replaceDraftConfirm"))) return;
                generateMutation.mutate();
              }}
              disabled={generateMutation.isPending || instructions.length > 500}
            >
              {generateMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Sparkles />
              )}{" "}
              {t("generateWithAi")}
            </Button>
            {generateMutation.isError && (
              <p role="alert" className="text-sm text-destructive">
                {friendlyError(generateMutation.error, t)}
              </p>
            )}
            {draftQuery.data?.usedFallback && (
              <p className="rounded-lg bg-muted p-3 text-sm">{t("emailFallback")}</p>
            )}
            {draftQuery.data?.smsUsedFallback && (
              <p className="rounded-lg bg-muted p-3 text-sm">{t("smsFallback")}</p>
            )}
          </div>
          <div className="space-y-4">
            <label className="block space-y-2 text-sm font-medium">
              {t("emailSubject")}
              <input
                className="h-11 w-full rounded-lg border bg-background px-3 font-normal"
                maxLength={200}
                value={subject}
                onChange={(event) => updateField("subject", event.target.value)}
                placeholder={t("emailSubjectPlaceholder")}
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              {t("emailContent")}{" "}
              <span className="font-normal text-muted-foreground">({content.length}/10.000)</span>
              <textarea
                className="min-h-36 w-full rounded-lg border bg-background p-3 font-normal"
                maxLength={10000}
                value={content}
                onChange={(event) => updateField("content", event.target.value)}
                placeholder={t("emailContentPlaceholder")}
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              {t("smsContent")}{" "}
              <span className="font-normal text-muted-foreground">
                ({smsContent.length}/10.000)
              </span>
              <textarea
                className="min-h-28 w-full rounded-lg border bg-background p-3 font-normal"
                maxLength={10000}
                value={smsContent}
                onChange={(event) => updateField("smsContent", event.target.value)}
                placeholder={t("smsContentPlaceholder")}
                aria-describedby={`invitation-sms-help-${weddingId}`}
              />
              <p
                id={`invitation-sms-help-${weddingId}`}
                className="text-xs font-normal leading-relaxed text-muted-foreground"
              >
                {t("smsContentHelp")}
              </p>
            </label>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t pt-4">
          {templateErrors.length > 0 && (
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              {templateErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          {conflictDraft && (
            <div
              role="alert"
              className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-50 p-4 text-sm text-amber-950"
            >
              <p className="flex gap-2">
                <AlertTriangle className="size-5 shrink-0" />{" "}
                {t("serverHasVersion", { version: conflictDraft.version })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={restoreLatest}>
                  {t("loadLatestDiscardEdits")}
                </Button>
                <Button onClick={retryOnLatest}>{t("keepEditsUseLatest")}</Button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={
                !dirty ||
                templateErrors.length > 0 ||
                saveMutation.isPending ||
                Boolean(conflictDraft)
              }
              onClick={() =>
                saveMutation.mutate({ subject, content, smsContent, version: form.version })
              }
            >
              {saveMutation.isPending ? <LoaderCircle className="animate-spin" /> : <Check />}{" "}
              {t("saveDraft")}
            </Button>
            {saveMessage && (
              <p role="status" className="text-sm text-muted-foreground">
                {saveMessage}
              </p>
            )}
            {dirty && <span className="text-sm text-muted-foreground">{t("unsavedChanges")}</span>}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <Mail className="size-5" />
            <h2 className="font-display text-xl">{t("previewAndTest")}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("previewDescription")}</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <select
              className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3"
              value={previewGuestId}
              onChange={(event) => setPreviewGuestId(event.target.value)}
            >
              <option value="">{t("selectGuest")}</option>
              {(recipientsQuery.data ?? []).map((guest) => (
                <option key={guest.id} value={guest.id}>
                  {guest.recipientName}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              disabled={!previewGuestId || !draftQuery.data || dirty || previewQuery.isFetching}
              onClick={() => void previewQuery.refetch()}
            >
              <RefreshCw className={previewQuery.isFetching ? "animate-spin" : ""} /> {t("preview")}
            </Button>
          </div>
          {dirty && <p className="mt-2 text-xs text-muted-foreground">{t("saveBeforePreview")}</p>}
          {previewQuery.isError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {friendlyError(previewQuery.error, t)}
            </p>
          )}
          {previewQuery.data && (
            <div className="mt-4 space-y-4 rounded-xl border p-4">
              <div role="tablist" aria-label={t("previewChannel")} className="flex gap-2">
                {(["EMAIL", "SMS"] as const).map((channel) => (
                  <button
                    key={channel}
                    role="tab"
                    aria-selected={previewTab === channel}
                    className={`rounded-lg px-3 py-2 text-sm ${previewTab === channel ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    onClick={() => setPreviewTab(channel)}
                  >
                    {channel}
                  </button>
                ))}
              </div>
              {previewTab === "EMAIL" ? (
                <div className="space-y-3">
                  <p className="font-semibold">{previewQuery.data.subject}</p>
                  <iframe
                    className="h-[680px] w-full rounded-xl border bg-white"
                    srcDoc={previewQuery.data.emailHtml}
                    title={t("emailPreviewTitle")}
                    sandbox=""
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <pre className="whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-sm">
                    {previewQuery.data.smsContent}
                  </pre>
                  {(() => {
                    const smsLength = countSmsSegments(previewQuery.data.smsContent);
                    return (
                      <p className={smsLength.segments > 3 ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
                        {t("smsSegmentCount", { encoding: smsLength.encoding, units: smsLength.units, segments: smsLength.segments })}
                        {smsLength.segments > 3 && ` ${t("smsOverLimit")}`}
                      </p>
                    );
                  })()}
                </div>
              )}
              <Button
                variant="outline"
                disabled={testMutation.isPending || dirty || !isPublished}
                onClick={() => {
                  if (window.confirm(t("testEmailConfirm"))) testMutation.mutate();
                }}
              >
                {testMutation.isPending ? <LoaderCircle className="animate-spin" /> : <Send />}{" "}
                {t("sendTestToMyEmail")}
              </Button>
              {dirty && <p className="text-xs text-muted-foreground">{t("saveBeforeTest")}</p>}
              {testMutation.isSuccess && (
                <p role="status" className="text-sm text-green-700">
                  {t("testAccepted")}
                </p>
              )}
              {testMutation.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {friendlyError(testMutation.error, t)}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <Send className="size-5" />
            <h2 className="font-display text-xl">{t("sendInvitations")}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("sendDescription")}</p>
          <div className="mt-4 flex gap-2">
            {(["GUESTS", "GROUP"] as const).map((mode) => (
              <button
                key={mode}
                disabled={sendMutation.isPending || Boolean(uncertainSend)}
                className={`rounded-lg px-3 py-2 text-sm ${recipientMode === mode ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                onClick={() => {
                  setRecipientMode(mode);
                  setSelectedIds([]);
                }}
              >
                {mode === "GUESTS" ? t("chooseGuests") : t("chooseGroup")}
              </button>
            ))}
          </div>
          {recipientMode === "GROUP" && recipientsQuery.isError && (
            <div role="alert" className="mt-3 text-sm text-destructive">
              <p>{t("groupListFailed", { error: friendlyError(recipientsQuery.error, t) })}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-2"
                onClick={() => void recipientsQuery.refetch()}
              >
                {t("reload")}
              </Button>
            </div>
          )}
          {recipientMode === "GROUP" ? (
            <label className="mt-3 block space-y-2 text-sm">
              {t("guestGroup")}
              <select
                className="h-11 w-full rounded-lg border bg-background px-3"
                value={groupId}
                disabled={
                  recipientsQuery.isPending || sendMutation.isPending || Boolean(uncertainSend)
                }
                onChange={(event) => {
                  setGroupId(event.target.value);
                }}
              >
                <option value="">{t("selectGroup")}</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="mt-4">
              <MessageRecipientPicker
                recipients={allRecipients}
                selectedIds={selectedIds}
                onChange={setSelectedIds}
                loading={recipientsQuery.isPending}
                failed={recipientsQuery.isError}
                onRetry={() => void recipientsQuery.refetch()}
                disabled={sendMutation.isPending || Boolean(uncertainSend)}
              />
            </div>
          )}
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">{t("deliveryChannels")}</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {(["EMAIL", "SMS"] as const).map((channel) => (
                <label key={channel} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={channels.includes(channel)}
                    disabled={sendMutation.isPending || Boolean(uncertainSend)}
                    onChange={(event) =>
                      setChannels((current) =>
                        event.target.checked
                          ? [...current, channel]
                          : current.filter((item) => item !== channel),
                      )
                    }
                  />
                  {channel === "EMAIL" ? (
                    <Mail className="size-4" />
                  ) : (
                    <MessageSquareText className="size-4" />
                  )}
                  {channel}
                </label>
              ))}
            </div>
          </fieldset>
          {missingContacts.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
              {t("missingContacts", { count: missingContacts.length })}
              <button
                type="button"
                disabled={sendMutation.isPending || Boolean(uncertainSend)}
                className="mt-2 block text-xs font-medium underline underline-offset-4"
                onClick={() => {
                  const missing = new Set(missingContacts);
                  setSelectedIds(recipientIds.filter((id) => !missing.has(id)));
                  setRecipientMode("GUESTS");
                }}
              >
                {t("removeMissingContacts", { count: missingContacts.length })}
              </button>
            </div>
          )}
          {selectionCount > MAX_MESSAGE_RECIPIENTS && (
            <p className="mt-3 text-sm text-destructive">{t("maxRecipients")}</p>
          )}
          <p className="mt-3 text-sm">
            {t("recipientsSummary")}: <strong>{selectionCount}</strong> · {t("channelsSummary")}:{" "}
            <strong>{channels.join(", ") || t("noneSelected")}</strong>
          </p>
          {uncertainSend && (
            <div className="mt-3 space-y-2 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm">
              <p>{t("uncertainSendDetails")}</p>
              <Button
                variant="outline"
                disabled={sendMutation.isPending}
                onClick={() => sendMutation.mutate(uncertainSend)}
              >
                {sendMutation.isPending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}{" "}
                {t("retrySameRequest")}
              </Button>
            </div>
          )}
          <Button className="mt-4 w-full" disabled={!canSend} onClick={beginSend}>
            {sendMutation.isPending ? <LoaderCircle className="animate-spin" /> : <Send />}{" "}
            {t("queueSend", { count: selectionCount })}
          </Button>
          {!isPublished && (
            <p className="mt-2 text-sm text-muted-foreground">{t("publishBeforeSend")}</p>
          )}
          {dirty && <p className="mt-2 text-xs text-muted-foreground">{t("saveBeforeSend")}</p>}
          {sendMutation.isError && !uncertainSend && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {friendlyError(sendMutation.error, t)}
            </p>
          )}
          {sendMutation.isError &&
            uncertainSend &&
            sendMutation.error instanceof ApiError &&
            sendMutation.error.code !== "network" && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {t("sendNotAccepted", { error: friendlyError(sendMutation.error, t) })}
              </p>
            )}
        </div>
      </section>

      {activeBatchId && (
        <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl">{t("latestBatch")}</h2>
            </div>
            <Button variant="outline" onClick={() => void batchQuery.refetch()}>
              <RefreshCw className={batchQuery.isFetching ? "animate-spin" : ""} /> {t("refresh")}
            </Button>
          </div>
          {batchQuery.isPending ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("loadingStatus")}</p>
          ) : batchQuery.isError ? (
            <div role="alert" className="mt-4">
              <p className="text-sm">{friendlyError(batchQuery.error, t)}</p>
              <Button className="mt-2" variant="outline" onClick={() => void batchQuery.refetch()}>
                {t("retry")}
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["statusLabel", statusLabel(batchQuery.data.status, t)],
                  ["total", batchQuery.data.totalCount],
                  ["sent", batchQuery.data.sentCount],
                  ["accepted", batchQuery.data.acceptedCount ?? 0],
                  ["delivered", batchQuery.data.deliveredCount ?? 0],
                  ["unknown", batchQuery.data.unknownCount ?? 0],
                  ["simulated", batchQuery.data.simulatedCount ?? 0],
                  [
                    "failedOrPending",
                    `${batchQuery.data.failedCount} / ${batchQuery.data.pendingCount}`,
                  ],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-muted/60 p-3">
                    <p className="text-xs text-muted-foreground">{t(String(label))}</p>
                    <p className="mt-1 font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => setShowRecipients((value) => !value)}>
                  {showRecipients ? t("hideRecipients") : t("showRecipients")}
                </Button>
                {batchQuery.data.jobs.some((job) => job.status === "FAILED") && (
                  <Button disabled={retryMutation.isPending} onClick={() => retryMutation.mutate()}>
                    {retryMutation.isPending ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <RefreshCw />
                    )}{" "}
                    {t("retryFailed")}
                  </Button>
                )}
                {retryMutation.data && (
                  <span className="text-sm text-muted-foreground">
                    {t("retriedJobs", { count: retryMutation.data.retried })}
                  </span>
                )}
                {retryMutation.isError && (
                  <span role="alert" className="text-sm text-destructive">
                    {friendlyError(retryMutation.error, t)}
                  </span>
                )}
              </div>
              <div className="mt-4 divide-y rounded-xl border">
                {batchQuery.data.jobs.slice(0, visibleJobs).map((job) => (
                  <div
                    key={job.id}
                    className="grid gap-1 p-3 text-sm sm:grid-cols-[1fr_1fr_auto] sm:items-center"
                  >
                    <div>
                      <span className="font-medium">{job.channel}</span>
                      <span className="ml-2 text-muted-foreground">
                        {showRecipients ? job.recipient : maskRecipient(job.recipient)}
                      </span>
                    </div>
                    <span className="text-muted-foreground">
                      {statusLabel(job.status, t)}
                      {job.errorCode
                        ? ` · ${friendlyError(new ApiError(422, "business-rule", "", {}, job.errorCode), t)}`
                        : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("attempt", { count: job.attemptCount })}
                    </span>
                  </div>
                ))}
              </div>
              {batchQuery.data.jobs.length > visibleJobs && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-3"
                  onClick={() => setVisibleJobs((count) => count + 50)}
                >
                  {t("loadMore")}
                </Button>
              )}
              <p className="mt-3 text-xs text-muted-foreground">{t("deliveryDisclaimer")}</p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
