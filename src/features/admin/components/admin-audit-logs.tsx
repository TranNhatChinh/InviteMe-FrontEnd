"use client";

import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { PageHeader } from "@/shared/components/page-header";
import { EmptyState } from "@/shared/feedback/empty-state";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { adminApi } from "../api/admin.api";
import { useLocale } from "@/i18n/language-context";
import { formatDate, formatNumber } from "@/i18n/format";

function bound(value: string, end: boolean) {
  return value
    ? new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}`).toISOString()
    : undefined;
}
export function AdminAuditLogs() {
  const { t } = useTranslation("admin");
  const { language } = useLocale();
  const { api } = useRuntime();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({
    action: "",
    entityType: "",
    entityId: "",
    from: "",
    to: "",
  });
  const [filters, setFilters] = useState<{
    action?: string;
    entityType?: string;
    entityId?: string;
    from?: string;
    to?: string;
  }>({});
  const [error, setError] = useState("");
  const logs = useQuery({
    queryKey: ["admin-audit-logs", page, filters],
    queryFn: ({ signal }) => adminApi.auditLogs(api, { page, pageSize: 25, ...filters }, signal),
  });
  function apply(event: FormEvent) {
    event.preventDefault();
    if (draft.from && draft.to && draft.to < draft.from) {
      setError(t("invalidDateRange"));
      return;
    }
    if (
      draft.entityId.trim() &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draft.entityId.trim())
    ) {
      setError(t("invalidAuditEntityId"));
      return;
    }
    setError("");
    setPage(1);
    setFilters({
      action: draft.action.trim() || undefined,
      entityType: draft.entityType.trim() || undefined,
      entityId: draft.entityId.trim() || undefined,
      from: bound(draft.from, false),
      to: bound(draft.to, true),
    });
  }
  function reset() {
    setDraft({ action: "", entityType: "", entityId: "", from: "", to: "" });
    setFilters({});
    setError("");
    setPage(1);
  }
  return (
    <div className="space-y-6">
      <PageHeader title={t("platformAuditTitle")} description={t("platformAuditDescription")} />
      <form
        onSubmit={apply}
        className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-6"
      >
        <label className="grid gap-1 text-sm">
          {t("auditAction")}
          <Input
            value={draft.action}
            maxLength={100}
            onChange={(e) => setDraft({ ...draft, action: e.target.value })}
            placeholder={t("auditActionPlaceholder")}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {t("auditEntityId")}
          <Input
            value={draft.entityId}
            maxLength={36}
            onChange={(e) => setDraft({ ...draft, entityId: e.target.value })}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </label>
        <label className="grid gap-1 text-sm">
          {t("auditRecordType")}
          <Input
            value={draft.entityType}
            maxLength={100}
            onChange={(e) => setDraft({ ...draft, entityType: e.target.value })}
            placeholder={t("auditRecordPlaceholder")}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {t("from")}
          <Input
            type="date"
            value={draft.from}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {t("to")}
          <Input
            type="date"
            value={draft.to}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          />
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit">{t("filter")}</Button>
          <Button type="button" variant="outline" onClick={reset}>
            {t("reset")}
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {logs.isPending && <LoadingState label={t("loadingAudit")} />}
      {logs.isError && <ErrorState error={logs.error} retry={() => void logs.refetch()} />}
      {logs.data &&
        (logs.data.items.length === 0 ? (
          <EmptyState title={t("noMatchingActivity")} description={t("widenFilters")} />
        ) : (
          <>
            <div className="space-y-3">
              {logs.data.items.map((log) => (
                <article key={log.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">{log.action.replaceAll("_", " ")}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {log.actorName || log.actorEmail || log.actorType} · {log.entityType}
                      </p>
                    </div>
                    <time className="text-sm text-muted-foreground" dateTime={log.createdAt}>
                      {formatDate(log.createdAt, language, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    {log.weddingTitle && (
                      <span>{t("weddingLabel", { title: log.weddingTitle })}</span>
                    )}
                    {log.weddingId && <span>{t("weddingIdLabel", { id: log.weddingId })}</span>}
                    {log.entityId && <span>{t("recordIdLabel", { id: log.entityId })}</span>}
                  </div>
                  {log.metadata != null && (
                    <details className="mt-3 border-t pt-3">
                      <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium">
                        {t("eventDetails")}
                      </summary>
                      <pre className="overflow-x-auto rounded-lg bg-muted/60 p-3 text-xs leading-5">
                        {JSON.stringify(log.metadata, null, 2) ?? ""}
                      </pre>
                    </details>
                  )}
                </article>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {t("eventCount", {
                  count: formatNumber(logs.data.totalCount, language),
                  page: formatNumber(logs.data.page, language),
                })}
                {Math.max(logs.data.totalPages, 1)}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1 || logs.isFetching}
                  onClick={() => setPage((x) => x - 1)}
                >
                  {t("previous", { ns: "common" })}
                </Button>
                <Button
                  variant="outline"
                  disabled={page >= logs.data.totalPages || logs.isFetching}
                  onClick={() => setPage((x) => x + 1)}
                >
                  {t("next", { ns: "common" })}
                </Button>
              </div>
            </div>
          </>
        ))}
    </div>
  );
}
