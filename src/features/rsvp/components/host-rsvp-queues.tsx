"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/i18n/language-context";
import { formatDate } from "@/i18n/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { usePermission } from "@/shared/components/permission-guard";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { hostRsvpKeys, listRsvpRequests, resolveRsvpRequest } from "../api/host-rsvp.api";

export function HostRsvpQueues({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("guests");
  const { language } = useLocale();
  const { api } = useRuntime();
  const cache = useQueryClient();
  const { can } = usePermission();
  const editable = can("GUEST_EDIT");
  const [requestPage, setRequestPage] = useState(1);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requests = useQuery({
    queryKey: hostRsvpKeys.requests(weddingId, "PENDING", requestPage),
    queryFn: ({ signal }) => listRsvpRequests(api, weddingId, "PENDING", requestPage, signal),
  });

  async function decide(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      await resolveRsvpRequest(api, weddingId, id, decision);
      await cache.invalidateQueries({ queryKey: hostRsvpKeys.all(weddingId) });
      setNotice(t("queues.updated"));
    } catch {
      setError(t("queues.errors.generic"));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title={t("queues.title")} description={t("queues.description")} />
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
          {notice}
        </p>
      )}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("queues.changeRequests")}</h2>
        {requests.isPending && <LoadingState label={t("queues.loadingRequests")} />}
        {requests.isError && (
          <ErrorState error={requests.error} retry={() => void requests.refetch()} />
        )}
        {requests.data?.items.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("queues.noRequests")}</p>
        )}
        {requests.data?.items.map((item) => (
          <article key={item.id} className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{item.recipientName}</h3>
                <p className="text-sm text-muted-foreground">
                  {t(`queues.reasons.${item.reason}`, { defaultValue: item.reason })} ·{" "}
                  {formatDate(item.requestedAt, language, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-900">
                {t("queues.awaitingReview")}
              </span>
            </div>
            <p className="text-sm">
              {t(
                item.change.decision === "ATTENDING"
                  ? "queues.wantsAttend"
                  : item.change.decision === "MAYBE"
                    ? "queues.wantsMaybe"
                    : "queues.wantsDecline",
              )}
              {item.change.partySize
                ? ` · ${t("queues.people", { count: item.change.partySize })}`
                : ""}
            </p>
            {item.change.note && (
              <p className="text-sm">
                {t("queues.note")}: {item.change.note}
              </p>
            )}
            {editable && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!!busyId}
                  onClick={() => void decide(item.id, "approve")}
                >
                  {busyId === item.id ? t("queues.processing") : t("queues.approve")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busyId}
                  onClick={() => void decide(item.id, "reject")}
                >
                  {t("queues.reject")}
                </Button>
              </div>
            )}
          </article>
        ))}
        {requests.data && (
          <Pager
            page={requestPage}
            total={requests.data.totalCount}
            pageSize={requests.data.pageSize}
            onChange={setRequestPage}
          />
        )}
      </section>
    </div>
  );
}

function Pager({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const { t } = useTranslation("guests");
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {t("queues.previous")}
      </Button>
      <span>{t("queues.page", { page, last })}</span>
      <Button
        size="sm"
        variant="outline"
        disabled={page >= last}
        onClick={() => onChange(page + 1)}
      >
        {t("queues.next")}
      </Button>
    </div>
  );
}
