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
import { Modal } from "@/shared/ui/modal";
import { adminApi } from "../api/admin.api";
import { useLocale } from "@/i18n/language-context";
import { formatDate, formatNumber } from "@/i18n/format";

export function AdminWeddings() {
  const { t } = useTranslation("admin");
  const { language } = useLocale();
  const { api } = useRuntime();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selectedWeddingId, setSelectedWeddingId] = useState<string | null>(null);
  const weddings = useQuery({
    queryKey: ["admin-weddings", page, search, status],
    queryFn: ({ signal }) => adminApi.weddings(api, { page, pageSize: 20, search, status }, signal),
  });
  const selectedWedding = useQuery({
    queryKey: ["admin-wedding-detail", selectedWeddingId],
    queryFn: ({ signal }) => {
      if (!selectedWeddingId) throw new Error("Select a wedding before loading its details.");
      return adminApi.weddingDetail(api, selectedWeddingId, signal);
    },
    enabled: Boolean(selectedWeddingId),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(draft.trim());
  }
  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title={t("weddingManagementTitle")}
          description={t("weddingManagementDescription")}
        />
        <form
          onSubmit={submit}
          className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_200px_auto_auto] sm:items-end"
        >
          <label className="grid gap-1 text-sm">
            {t("weddingSearchLabel")}
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={100}
              placeholder={t("searchWeddingsPlaceholder")}
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
              <option value="DRAFT">{t("draft")}</option>
              <option value="PUBLISHED">{t("published")}</option>
              <option value="CLOSED">{t("closed")}</option>
            </select>
          </label>
          <Button type="submit">{t("search")}</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft("");
              setSearch("");
              setStatus("");
              setPage(1);
            }}
          >
            {t("reset")}
          </Button>
        </form>
        {weddings.isPending && <LoadingState label={t("loadingWeddings")} />}
        {weddings.isError && (
          <ErrorState error={weddings.error} retry={() => void weddings.refetch()} />
        )}
        {weddings.data &&
          (weddings.data.items.length === 0 ? (
            <EmptyState title={t("noWeddings")} description={t("changeWeddingFilters")} />
          ) : (
            <>
              <div className="overflow-x-auto rounded-2xl border bg-card">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      {[t("wedding"), t("owner"), t("status"), t("capacity"), t("created")].map(
                        (x) => (
                          <th key={x} className="px-4 py-3 font-medium">
                            {x}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {weddings.data.items.map((w) => (
                      <tr key={w.id}>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            className="text-left font-medium text-primary hover:underline"
                            onClick={() => setSelectedWeddingId(w.id)}
                          >
                            {w.title}
                          </button>
                          <p className="text-xs text-muted-foreground">/{w.slug}</p>
                        </td>
                        <td className="px-4 py-4">{w.ownerEmail}</td>
                        <td className="px-4 py-4">
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                            {t(`${w.status.toLowerCase()}Status`, { defaultValue: w.status })}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {w.capacity === null ? t("notSet") : formatNumber(w.capacity, language)}
                        </td>
                        <td className="px-4 py-4 text-muted-foreground">
                          {formatDate(w.createdAt, language, { dateStyle: "medium" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {t("weddingCount", {
                    count: formatNumber(weddings.data.totalCount, language),
                    page: formatNumber(weddings.data.page, language),
                  })}
                  {Math.max(weddings.data.totalPages, 1)}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={page <= 1 || weddings.isFetching}
                    onClick={() => setPage((x) => x - 1)}
                  >
                    {t("previous", { ns: "common" })}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={page >= weddings.data.totalPages || weddings.isFetching}
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
        open={Boolean(selectedWeddingId)}
        onClose={() => setSelectedWeddingId(null)}
        title={t("weddingDetailTitle")}
        description={t("weddingDetailDescription")}
      >
        {selectedWedding.isPending && <LoadingState label={t("loadingWeddingDetail")} />}
        {selectedWedding.isError && (
          <ErrorState error={selectedWedding.error} retry={() => void selectedWedding.refetch()} />
        )}
        {selectedWedding.data && (
          <div className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="text-xs text-muted-foreground">{t("wedding")}</p>
                <p className="mt-1 font-semibold">{selectedWedding.data.wedding.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  /{selectedWedding.data.wedding.slug}
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="text-xs text-muted-foreground">{t("owner")}</p>
                <p className="mt-1 font-medium">{selectedWedding.data.wedding.ownerEmail}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("weddingStatusLabel", {
                    status: t(`${selectedWedding.data.wedding.status.toLowerCase()}Status`, {
                      defaultValue: selectedWedding.data.wedding.status,
                    }),
                  })}
                </p>
              </div>
            </section>
            <section className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{selectedWedding.data.plan.planName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedWedding.data.plan.planCode}
                    {selectedWedding.data.plan.legacy ? ` · ${t("legacyPlan")}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  {t("websiteStatusValue", { status: selectedWedding.data.websiteStatus })}
                </span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ["activeGuestCount", selectedWedding.data.activeGuests],
                  ["sentEmailCount", selectedWedding.data.emailInvitationsSent],
                  ["sentSmsCount", selectedWedding.data.smsInvitationsSent],
                  ["failedDeliveryCount", selectedWedding.data.failedInvitationJobs],
                  ["pendingDeliveryCount", selectedWedding.data.pendingInvitationJobs],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">{t(String(label))}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {formatNumber(Number(value), language)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3 className="font-semibold">{t("planUsageTitle")}</h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border p-4 text-sm sm:grid-cols-3">
                {[
                  ["guestPlacesUsage", selectedWedding.data.plan.usage.guestPlaces],
                  ["mediaImagesUsage", selectedWedding.data.plan.usage.mediaImages],
                  ["emailInvitesUsage", selectedWedding.data.plan.usage.emailInvites],
                  ["smsInvitesUsage", selectedWedding.data.plan.usage.smsInvites],
                  ["coHostsUsage", selectedWedding.data.plan.usage.coHosts],
                  ["aiRunsUsage", selectedWedding.data.plan.usage.aiThankYouRuns],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-xs text-muted-foreground">{t(String(label))}</dt>
                    <dd className="mt-1 font-medium tabular-nums">
                      {formatNumber(Number(value), language)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
            <p className="text-xs text-muted-foreground">
              {t("weddingCreated", {
                date: formatDate(selectedWedding.data.wedding.createdAt, language, {
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
