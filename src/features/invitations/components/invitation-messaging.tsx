"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, History, LoaderCircle, RefreshCw } from "lucide-react";
import { ApiError } from "@/core/api/api-error";
import { useRuntime } from "@/core/config/runtime";
import { Button } from "@/shared/ui/button";
import { usePermission } from "@/shared/components/permission-guard";
import {
  generateInvitationDraft,
  generateInvitationSmsDraft,
  getInvitationBatch,
  getInvitationDraft,
  previewInvitation,
  preflightInvitationSms,
  queueInvitationBatch,
  retryInvitationBatch,
  saveInvitationDraft,
  sendTestInvitation,
  type InvitationChannel,
  type InvitationDraft,
  type InvitationSendBody,
} from "../api/invitation-messaging.api";
import {
  loadAllMessageRecipients,
  MAX_MESSAGE_RECIPIENTS,
  missingRecipientContacts,
} from "@/shared/lib/message-recipients";
import { z } from "zod";
import { useTranslation } from "react-i18next";
// eslint-disable-next-line architecture/boundaries -- Invitation batch controls use the wedding plan's email and SMS quotas.
import { useWeddingPlan } from "@/features/plans";
import { useLocale } from "@/i18n/language-context";
import { groupKind, groupLabels } from "@/shared/lib/planning-groups";
import { InvitationWorkspaceView } from "./invitation-workspace-view";

const recipientSchema = z.object({
  id: z.string(),
  recipientName: z.string(),
  group: groupKind
    .nullable()
    .transform((group) => (group ? { id: group, name: groupLabels[group] } : null)),
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
  if (error.backendCode === "INVITATION_DRAFT_NOT_FOUND") return t("errors.draftNotFound");
  if (error.backendCode === "GUEST_NOT_FOUND") return t("errors.guestNotFound");
  if (error.backendCode === "WEDDING_NOT_FOUND") return t("errors.weddingNotFound");
  if (error.backendCode === "INVITATION_BATCH_NOT_FOUND") return t("errors.batchNotFound");
  if (error.backendCode === "NO_INVITATION_RECIPIENTS") return t("errors.noRecipients");
  if (error.status === 503 || error.backendCode === "INVITATION_CHANNEL_NOT_CONFIGURED")
    return t("errors.channelNotConfigured");
  if (
    ["SMS_PHONE_INVALID", "GUEST_PHONE_INVALID", "TEXTBEE_RECIPIENT_INVALID"].includes(
      error.backendCode ?? "",
    )
  )
    return t("errors.invalidPhone");
  if (
    [
      "TEXTBEE_NOT_CONFIGURED",
      "TEXTBEE_AUTH_FAILED",
      "TEXTBEE_ACCESS_DENIED",
      "TEXTBEE_DEVICE_NOT_FOUND",
    ].includes(error.backendCode ?? "")
  )
    return t("errors.providerNotConfigured");
  if (error.backendCode === "SMS_CONTENT_TOO_LONG") return t("errors.smsTooLong");
  if (error.backendCode === "SMS_COPY_WILL_BE_SHORTENED") return t("errors.smsCopyRequiresEdit");
  if (error.backendCode === "SMS_RECIPIENT_DETAILS_TOO_LONG") return t("errors.smsRecipientDetailsTooLong");
  if (error.backendCode === "SMS_COPY_BUDGET_TOO_SMALL") return t("errors.smsCopyBudgetTooSmall");
  if (error.backendCode === "AI_SMS_COPY_INVALID") return t("errors.smsAiInvalidOutput");
  if (error.backendCode === "AI_SMS_COPY_TOO_LONG") return t("errors.smsAiTooLong");
  if (error.backendCode === "INVITATION_LINK_INVALID") return t("errors.invalidInvitationLink");
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
  const { can, isOwner } = usePermission();
  const { language } = useLocale();
  const canViewGuests = can("GUEST_VIEW");
  const plan = useWeddingPlan(weddingId, can("INVITATION_SEND"));
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
  const [emailInstructions, setEmailInstructions] = useState("");
  const [smsInstructions, setSmsInstructions] = useState("");
  const [conflictDraft, setConflictDraft] = useState<InvitationDraft | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [previewGuestId, setPreviewGuestId] = useState("");
  const [composeChannel, setComposeChannel] = useState<InvitationChannel>("EMAIL");
  const [recipientMode, setRecipientMode] = useState<"GUESTS" | "GROUP">("GUESTS");
  const [groupId, setGroupId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [channels, setChannels] = useState<InvitationChannel[]>(["EMAIL"]);
  const [workspaceTab, setWorkspaceTab] = useState<"COMPOSE" | "HISTORY">("COMPOSE");
  const [recipientGroupFilter, setRecipientGroupFilter] = useState("ALL");
  const [recipientStatusFilter, setRecipientStatusFilter] = useState("ALL");
  const [reviewedPreview, setReviewedPreview] = useState<{
    guestId: string;
    version: number;
  } | null>(null);
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
  const selectedRecipientIds = useMemo(() => [...selectedIds].sort(), [selectedIds]);

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
        groupId: guest.group?.id,
        groupName: guest.group?.name,
      })),
    [recipientsQuery.data],
  );
  const smsPreflightQuery = useQuery({
    queryKey: ["invitation-messaging", weddingId, "sms-preflight", selectedRecipientIds, form.version],
    queryFn: ({ signal }) => preflightInvitationSms(api, weddingId, selectedRecipientIds, signal),
    enabled: Boolean(
      channels.includes("SMS") &&
        selectedRecipientIds.length > 0 &&
        selectedRecipientIds.length <= MAX_MESSAGE_RECIPIENTS &&
        draftQuery.data &&
        !dirty &&
        recipientsQuery.isSuccess,
    ),
    retry: false,
  });
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
        ...(emailInstructions.trim() ? { additionalInstructions: emailInstructions.trim() } : {}),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(draftKey(weddingId), next);
      setEdits(null);
      setConflictDraft(null);
      setSaveMessage(t("emailGeneratedSmsUnchanged"));
      setReviewedPreview(null);
    },
  });
  const generateSmsMutation = useMutation({
    mutationFn: () =>
      generateInvitationSmsDraft(api, weddingId, {
        expectedVersion: form.version,
        ...(selectedRecipientIds.length ? { guestIds: selectedRecipientIds } : {}),
        ...(smsInstructions.trim() ? { additionalInstructions: smsInstructions.trim() } : {}),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(draftKey(weddingId), next);
      setEdits((current) =>
        current ? { ...current, smsContent: next.smsContent, version: next.version } : null,
      );
      setConflictDraft(null);
      setComposeChannel("SMS");
      setReviewedPreview(null);
      setSaveMessage(
        next.smsCopyWasShortened
          ? t("smsGeneratedShortened", { limit: next.smsCopyLimit ?? 60 })
          : t("smsGeneratedEmailUnchanged"),
      );
      void queryClient.invalidateQueries({
        queryKey: ["invitation-messaging", weddingId, "preview"],
      });
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
      setReviewedPreview(null);
      void queryClient.invalidateQueries({
        queryKey: ["invitation-messaging", weddingId, "preview"],
      });
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
    onError: async (error) => {
      if (!(error instanceof ApiError) || error.code === "network") {
        setSaveMessage(t("uncertainSend"));
      } else {
        setUncertainSend(null);
        setSaveMessage(friendlyError(error, t));
        if (error.backendCode === "GUEST_NOT_FOUND" || error.backendCode === "NO_INVITATION_RECIPIENTS") {
          const refreshedRecipients = await recipientsQuery.refetch();
          if (refreshedRecipients.data) {
            const availableIds = new Set(refreshedRecipients.data.map((recipient) => recipient.id));
            setSelectedIds((current) => current.filter((id) => availableIds.has(id)));
            setPreviewGuestId((current) =>
              availableIds.has(current) ? current : (refreshedRecipients.data[0]?.id ?? ""),
            );
          }
        } else if (error.backendCode === "INVITATION_DRAFT_NOT_FOUND") {
          await draftQuery.refetch();
        }
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

  const latestStatusesByGuest = useMemo(() => {
    const statuses = new Map<string, Set<string>>();
    for (const job of batchQuery.data?.jobs ?? []) {
      const guestStatuses = statuses.get(job.guestId) ?? new Set<string>();
      guestStatuses.add(job.status);
      statuses.set(job.guestId, guestStatuses);
    }
    return statuses;
  }, [batchQuery.data?.jobs]);
  const filteredRecipients = useMemo(
    () =>
      allRecipients.filter((guest) => {
        if (recipientGroupFilter !== "ALL" && guest.groupId !== recipientGroupFilter) return false;
        if (recipientStatusFilter === "ALL") return true;
        const statuses = latestStatusesByGuest.get(guest.id);
        if (recipientStatusFilter === "NOT_IN_BATCH") return !statuses?.size;
        if (!statuses?.size) return false;
        if (recipientStatusFilter === "PENDING")
          return statuses.has("PENDING") || statuses.has("SENDING");
        if (recipientStatusFilter === "ACCEPTED")
          return statuses.has("ACCEPTED") || statuses.has("SENT");
        if (recipientStatusFilter === "DELIVERED") return statuses.has("DELIVERED");
        if (recipientStatusFilter === "FAILED") return statuses.has("FAILED");
        return true;
      }),
    [allRecipients, latestStatusesByGuest, recipientGroupFilter, recipientStatusFilter],
  );

  const { subject, content, smsContent } = form;
  const templateErrors = validateTemplate(subject, content, smsContent, t);
  const recipientIds = selectedIds;
  const missingContacts = missingRecipientContacts(allRecipients, recipientIds, channels);
  const selectionCount = recipientIds.length;
  const quotaFor = (channel: InvitationChannel) => {
    if (!plan.data) return null;
    const isEmail = channel === "EMAIL";
    const limit = isEmail ? plan.data.limits.emailInvites : plan.data.limits.smsInvites;
    const used = isEmail ? plan.data.usage.emailInvites : plan.data.usage.smsInvites;
    return {
      limit,
      used,
      remaining: limit === null ? null : Math.max(0, limit - used),
      feature: isEmail ? "emailInvites" : "smsInvites",
    };
  };
  const quotaIssue =
    plan.data && !plan.isError
      ? channels
          .map((channel) => ({ channel, quota: quotaFor(channel) }))
          .find(
            ({ quota }) => quota && quota.remaining !== null && quota.remaining < selectionCount,
          )
      : undefined;
  const planUnavailable = plan.isError || (!plan.isPending && !plan.data);
  const canSend = Boolean(
    draftQuery.data &&
    isPublished &&
    canViewGuests &&
    selectionCount > 0 &&
    selectionCount <= MAX_MESSAGE_RECIPIENTS &&
    recipientsQuery.isSuccess &&
    templateErrors.length === 0 &&
    channels.length &&
    !plan.isPending &&
    (!plan.data || !quotaIssue) &&
    !dirty &&
    !generateMutation.isPending &&
    !saveMutation.isPending &&
    !conflictDraft &&
    !missingContacts.length &&
    (!channels.includes("SMS") ||
      (smsPreflightQuery.isSuccess &&
        !smsPreflightQuery.isFetching &&
        smsPreflightQuery.data.unsendableCount === 0 &&
        smsPreflightQuery.data.shortenedCount === 0)) &&
    reviewedPreview?.guestId === previewGuestId &&
    reviewedPreview?.version === form.version &&
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
    setReviewedPreview(null);
  }

  async function saveAndRefreshPreview() {
    if (!previewGuestId) return;
    let previewVersion = form.version;
    if (dirty) {
      try {
        const saved = await saveMutation.mutateAsync({
          subject,
          content,
          smsContent,
          version: form.version,
        });
        previewVersion = saved.version;
      } catch {
        return;
      }
    }
    const queryKey = ["invitation-messaging", weddingId, "preview", previewGuestId] as const;
    try {
      const nextPreview = await queryClient.fetchQuery({
        queryKey,
        queryFn: () => previewInvitation(api, weddingId, previewGuestId),
        staleTime: 0,
      });
      queryClient.setQueryData(queryKey, nextPreview);
      setReviewedPreview({ guestId: previewGuestId, version: previewVersion });
      setSaveMessage("");
    } catch {
      await previewQuery.refetch();
    }
  }

  function formatBatchDate(value: string) {
    return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date(value));
  }
  function confirmSend() {
    if (!canSend) return;
    const groupGuestIds = allRecipients
      .filter((guest) => guest.groupId === groupId)
      .map((guest) => guest.id);
    const selectedSet = new Set(selectedIds);
    const isCompleteSingleGroupSelection =
      recipientMode === "GROUP" &&
      Boolean(groupId) &&
      groupGuestIds.length === selectedIds.length &&
      groupGuestIds.every((id) => selectedSet.has(id));
    const body: InvitationSendBody = isCompleteSingleGroupSelection
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
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">{t("workspaceTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("workspaceDescription")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            role="status"
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${dirty ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}
          >
            {dirty ? t("unsavedChanges") : draftQuery.data ? t("draftSaved") : t("noDraft")}
          </span>
          {workspaceTab === "COMPOSE" && (
            <Button
              type="button"
              variant="outline"
              className="min-h-10"
              onClick={() => setWorkspaceTab("HISTORY")}
            >
              <History className="size-4" />
              {t("historyTab")}
            </Button>
          )}
          {workspaceTab === "HISTORY" && (
            <Button
              type="button"
              variant="outline"
              className="min-h-10"
              onClick={() => setWorkspaceTab("COMPOSE")}
            >
              {t("startCompose")}
            </Button>
          )}
          {workspaceTab === "COMPOSE" && (
            <Button
              type="button"
              className="min-h-10"
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
              {saveMutation.isPending ? <LoaderCircle className="animate-spin" /> : <Check />}
              {saveMutation.isPending ? t("savingDraft") : t("saveDraft")}
            </Button>
          )}
        </div>
      </header>
      {workspaceTab === "COMPOSE" ? (
        <InvitationWorkspaceView
          weddingId={weddingId}
          isPublished={isPublished}
          canViewGuests={canViewGuests}
          isOwner={isOwner}
          plan={plan}
          planUnavailable={planUnavailable}
          quotaIssue={quotaIssue}
          quotaFor={quotaFor}
          draft={draftQuery.data}
          subject={subject}
          content={content}
          smsContent={smsContent}
          dirty={dirty}
          emailFallback={draftQuery.data?.usedFallback ?? false}
          smsFallback={draftQuery.data?.smsUsedFallback ?? false}
          smsPreflight={smsPreflightQuery.data}
          smsPreflightPending={smsPreflightQuery.isFetching}
          smsPreflightError={
            smsPreflightQuery.error ? friendlyError(smsPreflightQuery.error, t) : ""
          }
          emailInstructions={emailInstructions}
          setEmailInstructions={setEmailInstructions}
          smsInstructions={smsInstructions}
          setSmsInstructions={setSmsInstructions}
          saveMessage={saveMessage}
          templateErrors={templateErrors}
          conflictDraft={conflictDraft}
          onRestoreLatest={restoreLatest}
          onRetryOnLatest={retryOnLatest}
          savePending={saveMutation.isPending}
          generatePending={generateMutation.isPending}
          generateSmsPending={generateSmsMutation.isPending}
          testPending={testMutation.isPending}
          generateError={generateMutation.error ? friendlyError(generateMutation.error, t) : ""}
          generateSmsError={
            generateSmsMutation.error ? friendlyError(generateSmsMutation.error, t) : ""
          }
          testError={testMutation.error ? friendlyError(testMutation.error, t) : ""}
          onUpdateField={updateField}
          onGenerateEmail={() => generateMutation.mutate()}
          onGenerateSms={() => generateSmsMutation.mutate()}
          onSendTest={() => testMutation.mutate()}
          composeChannel={composeChannel}
          onComposeChannelChange={setComposeChannel}
          allRecipients={allRecipients}
          groups={groups}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          recipientMode={recipientMode}
          onRecipientModeChange={setRecipientMode}
          groupId={groupId}
          onGroupIdChange={setGroupId}
          recipientGroupFilter={recipientGroupFilter}
          onRecipientGroupFilterChange={setRecipientGroupFilter}
          recipientStatusFilter={recipientStatusFilter}
          onRecipientStatusFilterChange={setRecipientStatusFilter}
          filteredRecipients={filteredRecipients}
          recipientsPending={recipientsQuery.isPending}
          recipientsError={recipientsQuery.isError}
          recipientsErrorMessage={
            recipientsQuery.error ? friendlyError(recipientsQuery.error, t) : ""
          }
          onReloadRecipients={() => void recipientsQuery.refetch()}
          channels={channels}
          onChannelsChange={setChannels}
          missingContactCount={missingContacts.length}
          selectionCount={selectionCount}
          previewGuestId={previewGuestId}
          onPreviewGuestIdChange={(id) => {
            setPreviewGuestId(id);
            setReviewedPreview(null);
          }}
          preview={previewQuery.data}
          previewPending={previewQuery.isFetching}
          previewError={previewQuery.error ? friendlyError(previewQuery.error, t) : ""}
          previewReviewed={
            reviewedPreview?.guestId === previewGuestId && reviewedPreview.version === form.version
          }
          onRefreshPreview={() => void saveAndRefreshPreview()}
          canSend={canSend}
          sendPending={sendMutation.isPending}
          hasUncertainSend={Boolean(uncertainSend)}
          sendError={sendMutation.error ? friendlyError(sendMutation.error, t) : ""}
          sendErrorIsDefinitive={
            sendMutation.error instanceof ApiError && sendMutation.error.code !== "network"
          }
          onConfirmSend={confirmSend}
          onRetryUncertain={() => {
            if (uncertainSend) sendMutation.mutate(uncertainSend);
          }}
          activeBatchId={activeBatchId}
          batch={batchQuery.data}
          batchStatusLabel={(status) => statusLabel(status, t)}
          batchPending={batchQuery.isPending}
          batchError={batchQuery.error ? friendlyError(batchQuery.error, t) : ""}
          batchRefreshing={batchQuery.isFetching}
          onRefreshBatch={() => void batchQuery.refetch()}
          retryPending={retryMutation.isPending}
          retryCount={retryMutation.data?.retried ?? null}
          retryError={retryMutation.error ? friendlyError(retryMutation.error, t) : ""}
          onRetryFailed={() => retryMutation.mutate()}
          onOpenHistory={() => setWorkspaceTab("HISTORY")}
          formatBatchDate={formatBatchDate}
        />
      ) : (
        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-hover">
                {t("historyTab")}
              </p>
              <h3 className="mt-1 font-display text-xl">{t("latestBatch")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("historyScope")}</p>
            </div>
            {activeBatchId && (
              <Button type="button" variant="outline" onClick={() => void batchQuery.refetch()}>
                <RefreshCw className={batchQuery.isFetching ? "animate-spin" : ""} />
                {t("refresh")}
              </Button>
            )}
          </div>
          {!activeBatchId ? (
            <div className="py-12 text-center">
              <Clock3 className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-medium">{t("noBatchHistory")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("noBatchHistoryHelp")}</p>
              <Button
                type="button"
                className="mt-4"
                onClick={() => {
                  setWorkspaceTab("COMPOSE");
                }}
              >
                {t("startCompose")}
              </Button>
            </div>
          ) : batchQuery.isPending ? (
            <p role="status" className="py-8 text-sm text-muted-foreground">
              {t("loadingStatus")}
            </p>
          ) : batchQuery.isError ? (
            <div role="alert" className="py-6">
              <p className="text-sm">{friendlyError(batchQuery.error, t)}</p>
              <Button
                type="button"
                className="mt-3"
                variant="outline"
                onClick={() => void batchQuery.refetch()}
              >
                {t("retry")}
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-5 flex flex-col gap-3 rounded-xl bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-end">
                <div className="shrink-0 text-sm sm:text-right">
                  <p className="font-medium">{formatBatchDate(batchQuery.data.createdAt)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[...new Set(batchQuery.data.jobs.map((job) => job.channel))].join(" + ")}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
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
                    batchQuery.data.failedCount + " / " + batchQuery.data.pendingCount,
                  ],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">{t(String(label))}</p>
                    <p className="mt-1 font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowRecipients((v) => !v)}
                >
                  {showRecipients ? t("hideRecipients") : t("showRecipients")}
                </Button>
                {batchQuery.data.jobs.some((job) => job.status === "FAILED") && (
                  <Button
                    type="button"
                    disabled={retryMutation.isPending}
                    onClick={() => retryMutation.mutate()}
                  >
                    {retryMutation.isPending ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <RefreshCw />
                    )}
                    {t("retryFailed")}
                  </Button>
                )}
                {retryMutation.data && (
                  <span role="status" className="text-sm text-muted-foreground">
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
                    className="grid gap-1 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{job.channel}</span>
                      <span className="ml-2 break-all text-muted-foreground">
                        {showRecipients ? job.recipient : maskRecipient(job.recipient)}
                      </span>
                    </div>
                    <span className="text-muted-foreground">
                      {statusLabel(job.status, t)}
                      {job.errorCode
                        ? " · " +
                          friendlyError(
                            new ApiError(422, "business-rule", "", {}, job.errorCode),
                            t,
                          )
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
                  onClick={() => setVisibleJobs((n) => n + 50)}
                >
                  {t("loadMore")}
                </Button>
              )}
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {t("deliveryDisclaimer")}
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
