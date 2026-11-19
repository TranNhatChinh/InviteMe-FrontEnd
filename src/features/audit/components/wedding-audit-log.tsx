"use client";

import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { usePermission } from "@/shared/components/permission-guard";
import { PageHeader } from "@/shared/components/page-header";
import { EmptyState } from "@/shared/feedback/empty-state";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { listWeddingAuditLogs, type AuditLogFilters } from "../api/audit.api";
import { useLocale } from "@/i18n/language-context";
import { formatDate, formatNumber } from "@/i18n/format";

function metadataText(metadata: unknown, key: string): string | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;

  const record = metadata as Record<string, unknown>;
  const value = Object.entries(record).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function dateBound(value: string, endOfDay: boolean) {
  if (!value) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  return date.toISOString();
}

export function WeddingAuditLog({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("audit");
  const { language } = useLocale();
  const { api } = useRuntime();
  const { isOwner } = usePermission();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({ action: "", entityType: "", from: "", to: "" });
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [filterError, setFilterError] = useState("");
  const query = useQuery({
    queryKey: ["wedding-audit-logs", weddingId, page, filters],
    queryFn: ({ signal }) => listWeddingAuditLogs(api, weddingId, page, filters, signal),
    enabled: isOwner,
  });

  if (!isOwner)
    return <EmptyState title={t("ownerOnlyTitle")} description={t("ownerOnlyDescription")} />;

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from && draft.to && draft.to < draft.from) {
      setFilterError(t("endDateBeforeStart"));
      return;
    }
    setFilterError("");
    setPage(1);
    setFilters({
      action: draft.action.trim() || undefined,
      entityType: draft.entityType.trim() || undefined,
      from: dateBound(draft.from, false),
      to: dateBound(draft.to, true),
    });
  }

  function reset() {
    setDraft({ action: "", entityType: "", from: "", to: "" });
    setFilters({});
    setFilterError("");
    setPage(1);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />
      <form
        onSubmit={apply}
        className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5"
      >
        <label className="grid gap-1 text-sm">
          {t("action")}
          <Input
            value={draft.action}
            maxLength={100}
            onChange={(event) => setDraft({ ...draft, action: event.target.value })}
            placeholder={t("actionPlaceholder")}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {t("entityType")}
          <Input
            value={draft.entityType}
            maxLength={100}
            onChange={(event) => setDraft({ ...draft, entityType: event.target.value })}
            placeholder={t("entityPlaceholder")}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {t("fromDate")}
          <Input
            type="date"
            value={draft.from}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {t("toDate")}
          <Input
            type="date"
            value={draft.to}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
          />
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={query.isFetching}>
            {t("filter")}
          </Button>
          <Button type="button" variant="outline" onClick={reset}>
            {t("clearFilters")}
          </Button>
        </div>
      </form>
      {filterError && (
        <p role="alert" className="text-sm text-destructive">
          {filterError}
        </p>
      )}
      {query.isPending && <LoadingState label={t("loading")} />}
      {query.isError && <ErrorState error={query.error} retry={() => void query.refetch()} />}
      {query.data && (
        <>
          {!query.data.items.length ? (
            <EmptyState title={t("noMatches")} description={t("noMatchesHint")} />
          ) : (
            <div className="space-y-3">
              {query.data.items.map((entry) => {
                const actor =
                  entry.actorName ||
                  entry.actorEmail ||
                  t(`actors.${entry.actorType}`, { defaultValue: t("actors.unknown") });
                const channel = metadataText(entry.metadata, "channel")?.toUpperCase();
                const channelLabel =
                  channel === "SMS" || channel === "EMAIL" ? t(`channels.${channel}`) : undefined;

                return (
                  <article key={entry.id} className="space-y-2 rounded-xl border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="font-semibold">
                          {t(`actions.${entry.action}`, { defaultValue: t("unknownAction") })}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {actor}
                          {channelLabel ? ` · ${channelLabel}` : null}
                        </p>
                      </div>
                      <time className="text-sm text-muted-foreground" dateTime={entry.createdAt}>
                        {formatDate(entry.createdAt, language, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </time>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {t("activityCount", { count: formatNumber(query.data.totalCount, language) })} ·{" "}
              {t("page", { current: query.data.page })}
              {Math.max(query.data.totalPages, 1)}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((current) => current - 1)}
              >
                {t("previous", { ns: "common" })}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={page >= query.data.totalPages || query.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                {t("next", { ns: "common" })}
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
