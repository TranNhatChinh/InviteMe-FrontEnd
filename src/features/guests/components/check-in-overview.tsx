"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useRuntime } from "@/core/config/runtime";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { PageHeader } from "@/shared/components/page-header";
import { getCheckInSummary } from "../api/check-in-summary.api";
import { useLocale } from "@/i18n/language-context";
import { formatNumber } from "@/i18n/format";

export function CheckInOverview({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("guests");
  const { language } = useLocale();
  const { api } = useRuntime();
  const summary = useQuery({
    queryKey: ["check-in-summary", weddingId],
    queryFn: ({ signal }) => getCheckInSummary(api, weddingId, signal),
  });

  if (summary.isPending) return <LoadingState label={t("checkIn.loading")} />;
  if (summary.isError)
    return <ErrorState error={summary.error} retry={() => void summary.refetch()} />;

  const data = summary.data;
  const stats = [
    { label: t("checkIn.checkedIn"), value: data.checkedIn },
    { label: t("checkIn.expectedPlaces"), value: data.expectedPlaces },
    { label: t("checkIn.confirmedRsvp"), value: data.checkedInConfirmed },
    { label: t("checkIn.arrivedWithoutRsvp"), value: data.checkedInWithoutRsvp },
    { label: t("checkIn.rsvpExceptions"), value: data.checkedInExceptions },
    { label: t("checkIn.walkIns"), value: data.checkedInWalkIns },
    { label: t("checkIn.counterVerified"), value: data.checkedInCounterVerified },
    { label: t("checkIn.invitedCompanions"), value: data.checkedInInvitedCompanions },
    { label: t("checkIn.unassigned"), value: data.checkedInUnassigned },
  ];

  return (
    <section className="space-y-6">
      <PageHeader title={t("checkIn.title")} description={t("checkIn.description")} />
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((item) => (
          <div key={item.label} className="rounded-xl border bg-card p-4">
            <dt className="text-sm text-muted-foreground">{item.label}</dt>
            <dd className="mt-2 text-3xl font-semibold tabular-nums">
              {formatNumber(item.value, language)}
            </dd>
          </div>
        ))}
      </dl>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-semibold">{t("checkIn.bySide")}</h2>
        {!data.bySide.length ? (
          <p className="text-sm text-muted-foreground">{t("checkIn.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t("checkIn.side")}</th>
                  <th className="px-3 py-2 font-medium">{t("checkIn.arrived")}</th>
                  <th className="px-3 py-2 font-medium">{t("checkIn.expected")}</th>
                </tr>
              </thead>
              <tbody>
                {data.bySide.map((item) => (
                  <tr key={item.side} className="border-b last:border-0">
                    <th scope="row" className="px-3 py-3 font-medium">
                      {t(`planning.sideValues.${item.side}`, { defaultValue: item.side })}
                    </th>
                    <td className="px-3 py-3 tabular-nums">
                      {formatNumber(item.checkedIn, language)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {formatNumber(item.expectedPlaces, language)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
