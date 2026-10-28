"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { useLanguage } from "@/i18n/language-context";
import { formatNumber } from "@/i18n/format";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { listPlanningGuests, sideLabels } from "../api/planning.api";

/**
 * The guests already in the wedding, open beside the file check: a row reported as a duplicate phone or name can be
 * compared with the guest it clashes with without leaving the import (leaving would drop the file).
 */
export function ImportCurrentGuests({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "importPage.currentGuests" });
  const { language } = useLanguage();
  const { api } = useRuntime();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const guests = useQuery({
    queryKey: ["guest-planning", weddingId, "import-current", page, search.trim()],
    queryFn: ({ signal }) => listPlanningGuests(api, weddingId, page, search.trim(), signal),
    enabled: open,
    placeholderData: (previous) => previous,
  });
  const total = guests.data?.totalItems ?? 0;
  const pages = Math.max(1, Math.ceil(total / (guests.data?.pageSize ?? 20)));

  return (
    <details
      className="rounded-2xl border bg-card p-5"
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-sm font-medium">
        {guests.data ? t("titleWithCount", { count: formatNumber(total, language) }) : t("title")}
      </summary>
      <div className="mt-4 space-y-3">
        <Input
          type="search"
          value={search}
          aria-label={t("search")}
          placeholder={t("search")}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        {guests.isPending ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : guests.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-destructive">{t("error")}</span>
            <Button variant="outline" size="sm" onClick={() => void guests.refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : guests.data.items.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
            {search.trim() ? t("noMatch") : t("empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-normal">{t("name")}</th>
                  <th className="py-2 pr-3 text-right font-normal">{t("people")}</th>
                  <th className="py-2 pr-3 font-normal">{t("side")}</th>
                  <th className="py-2 pr-3 font-normal">{t("group")}</th>
                  <th className="py-2 font-normal">{t("contact")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {guests.data.items.map((guest) => (
                  <tr key={guest.id}>
                    <td className="py-2 pr-3 font-medium">
                      {[guest.honorific, guest.recipientName].filter(Boolean).join(" ")}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{guest.expectedPeople}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{sideLabels[guest.side]}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{guest.group?.name ?? "—"}</td>
                    <td className="py-2 text-muted-foreground">
                      {[guest.phone, guest.email].filter(Boolean).join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {t("pageOf", {
                page: formatNumber(page, language),
                pages: formatNumber(pages, language),
              })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {t("previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                {t("next")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
