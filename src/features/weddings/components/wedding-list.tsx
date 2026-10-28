"use client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { parseISO } from "date-fns";
import {
  ArrowUpRight,
  CalendarDays,
  Flower2,
  Image as ImageIcon,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { Pagination } from "@/shared/components/pagination";
import { SearchInput } from "@/shared/components/search-input";
import { ErrorState } from "@/shared/feedback/error-state";
import { Button } from "@/shared/ui/button";
import { resolveWeddingMediaUrl } from "./wedding-cover-uploader";
import { useWeddings } from "../hooks/use-weddings";
import type { WeddingListSort } from "../api/wedding.api";
import { useLocale } from "@/i18n/language-context";
import { formatDate, formatNumber } from "@/i18n/format";

const WEDDING_PAGE_SIZE = 20;
const SORT_OPTIONS: { value: WeddingListSort; key: string }[] = [
  { value: "weddingDate", key: "sortDate" },
  { value: "createdAt", key: "sortRecent" },
  { value: "title", key: "sortName" },
];

function WeddingListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="overflow-hidden rounded-[1.35rem] border border-border bg-card"
          >
            <div className="aspect-[16/10] animate-pulse bg-petal motion-reduce:animate-none" />
            <div className="space-y-4 p-5">
              <div className="h-5 w-2/3 animate-pulse rounded bg-petal motion-reduce:animate-none" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-petal motion-reduce:animate-none" />
              <div className="h-10 animate-pulse rounded-xl bg-petal motion-reduce:animate-none" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeddingCover({
  imageUrl,
  weddingName,
  dateLabel,
  t,
}: {
  imageUrl: string | null;
  weddingName: string;
  dateLabel: string;
  t: (key: string, options?: { name: string }) => string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const resolvedUrl = resolveWeddingMediaUrl(imageUrl);

  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-petal">
      {resolvedUrl && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedUrl}
          alt={t("coverAlt", { name: weddingName })}
          className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.035] motion-reduce:transform-none motion-reduce:transition-none"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_18%_100%,rgba(239,163,179,0.48),transparent_50%),linear-gradient(135deg,#fff9fa_0%,#fdecef_56%,#f8c9d2_100%)] text-primary-hover">
          <div
            aria-hidden="true"
            className="absolute -right-10 -top-16 size-48 rounded-full border border-white/50"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-24 -left-12 size-56 rounded-full border border-white/50"
          />
          <div className="relative flex size-12 items-center justify-center rounded-full border border-white/75 bg-white/65 shadow-sm">
            {imageFailed ? (
              <ImageIcon className="size-5" aria-hidden="true" />
            ) : (
              <Flower2 className="size-5" aria-hidden="true" />
            )}
          </div>
          <span className="relative mt-2 text-xs font-medium text-[#75535e]">
            {imageFailed ? t("coverFailed") : t("noCover")}
          </span>
        </div>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#27131d]/50 to-transparent"
      />
      <span className="absolute bottom-3 left-4 inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/65 bg-white/90 px-3 text-xs font-semibold text-[#3b202b] shadow-sm backdrop-blur">
        <CalendarDays className="size-3.5 text-primary-hover" aria-hidden="true" />
        {dateLabel}
      </span>
      <span className="absolute right-3 top-3 rounded-full border border-white/60 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3b202b] shadow-sm backdrop-blur">
        InviteMe
      </span>
    </div>
  );
}

export function WeddingList({ requestedPlan }: { requestedPlan?: string } = {}) {
  const { t } = useTranslation("weddings");
  const { language } = useLocale();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<WeddingListSort>("weddingDate");
  const weddings = useWeddings({ page, pageSize: WEDDING_PAGE_SIZE, search, sort });
  const hasSearch = search.trim().length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-10 sm:space-y-9">
      <div className="relative overflow-hidden rounded-[1.6rem] border border-border bg-card px-5 py-6 shadow-[0_12px_38px_rgba(91,42,57,0.055)] sm:px-8 sm:py-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-[radial-gradient(circle,rgba(248,201,210,0.58),rgba(248,201,210,0)_68%)]"
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-hover">
              {t("yourWorkspace")}
            </p>
            <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
              {t("memorableDays")}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              {t("manageDescription")}
            </p>
          </div>
          <Button asChild className="min-h-11 w-full rounded-xl px-5 shadow-sm sm:w-auto">
            <Link href="/weddings/new">
              <Plus aria-hidden="true" />
              {t("createWedding")}
            </Link>
          </Button>
        </div>
        {requestedPlan && (
          <p
            role="status"
            className="relative mt-5 rounded-xl bg-primary/10 px-4 py-3 text-sm text-foreground"
          >
            {t("choosePlanWedding")}
          </p>
        )}
        {weddings.data && (
          <div className="relative mt-6 flex items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
            <span className="flex size-7 items-center justify-center rounded-full bg-petal text-primary-hover">
              <Flower2 className="size-4" aria-hidden="true" />
            </span>
            <span>
              <strong className="font-semibold text-foreground">
                {formatNumber(weddings.data.totalCount, language)}
              </strong>{" "}
              {t("weddingsCount")}
            </span>
          </div>
        )}
      </div>

      <section
        aria-label={t("findAndSort")}
        className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="w-full md:max-w-lg">
            <SearchInput
              label={t("searchWedding")}
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />
            <p className="mt-1.5 pl-1 text-xs text-muted-foreground">{t("searchHint")}</p>
          </div>
          <label className="flex w-full flex-col gap-1.5 text-sm font-medium text-foreground md:w-56">
            {t("sortBy")}
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as WeddingListSort);
                setPage(1);
              }}
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus-visible:border-primary-hover focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.key)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {weddings.isError ? (
        <ErrorState error={weddings.error} retry={() => void weddings.refetch()} />
      ) : !weddings.data ? (
        <WeddingListSkeleton label={t("loadingListDetails")} />
      ) : weddings.data.items.length === 0 ? (
        <section className="rounded-[1.6rem] border border-border bg-card px-6 py-12 text-center shadow-sm sm:px-10 sm:py-16">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-petal text-primary-hover">
            {hasSearch ? (
              <Search className="size-6" aria-hidden="true" />
            ) : (
              <Flower2 className="size-7" aria-hidden="true" />
            )}
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-hover">
            {hasSearch ? t("notFound") : t("journeyStart")}
          </p>
          <h2 className="font-display text-2xl tracking-tight sm:text-3xl">
            {hasSearch ? t("noMatches") : t("startHere")}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {hasSearch ? t("tryAnotherSearch") : t("firstWeddingPrompt")}
          </p>
          {!hasSearch && (
            <Button asChild className="mt-6 min-h-11 rounded-xl px-5">
              <Link href="/weddings/new">
                <Plus aria-hidden="true" />
                {t("createWedding")}
              </Link>
            </Button>
          )}
        </section>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3 px-1 text-sm text-muted-foreground">
            <p>
              {t("showing")}{" "}
              <span className="font-semibold text-foreground">{weddings.data.items.length}</span>{" "}
              {t("of")}{" "}
              <span className="font-semibold text-foreground">{weddings.data.totalCount}</span>{" "}
              {t("weddingsCount")}
            </p>
            {weddings.isFetching && <span className="text-xs">{t("updating")}</span>}
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">
            {weddings.data.items.map((wedding) => {
              const capacity = wedding.maxCapacity;
              const participantRatio =
                capacity > 0 ? Math.min(100, (wedding.participantCount / capacity) * 100) : 0;
              return (
                <article
                  key={wedding.id}
                  className="group overflow-hidden rounded-[1.35rem] border border-border bg-card shadow-[0_6px_22px_rgba(91,42,57,0.055)] transition duration-200 hover:-translate-y-0.5 hover:border-brand-soft hover:shadow-[0_16px_34px_rgba(91,42,57,0.12)] motion-reduce:transform-none motion-reduce:transition-none"
                >
                  <WeddingCover
                    imageUrl={wedding.coverImageUrl ?? null}
                    weddingName={wedding.title}
                    dateLabel={
                      wedding.weddingDate
                        ? formatDate(parseISO(wedding.weddingDate), language, {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })
                        : t("dateNotSet")
                    }
                    t={t}
                  />
                  <div className="p-5 sm:p-5">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <h2 className="min-w-0 font-display text-xl leading-snug tracking-tight text-foreground sm:text-[1.35rem]">
                        {wedding.title}
                      </h2>
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-petal text-primary-hover transition group-hover:bg-primary group-hover:text-primary-foreground"
                      >
                        <ArrowUpRight className="size-4" />
                      </span>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <CalendarDays
                        className="size-4 shrink-0 text-primary-hover"
                        aria-hidden="true"
                      />
                      <span className="truncate">
                        {wedding.weddingDate
                          ? formatDate(parseISO(wedding.weddingDate), language, {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })
                          : t("eventDateNotSet")}
                      </span>
                    </div>
                    <div className="mt-4 rounded-xl bg-background px-3.5 py-3">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                          <Users className="size-3.5 text-primary-hover" aria-hidden="true" />
                          {t("confirmedGuests")}
                        </span>
                        <span className="font-semibold text-foreground">
                          {formatNumber(wedding.participantCount, language)}
                          {capacity > 0
                            ? ` / ${formatNumber(capacity, language)}`
                            : ` ${t("people")}`}
                        </span>
                      </div>
                      {capacity > 0 ? (
                        <div
                          className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-soft/60"
                          role="progressbar"
                          aria-label={t("confirmedGuests")}
                          aria-valuemin={0}
                          aria-valuemax={capacity}
                          aria-valuenow={Math.min(wedding.participantCount, capacity)}
                        >
                          <div
                            className="h-full rounded-full bg-primary-hover transition-[width]"
                            style={{ width: `${participantRatio}%` }}
                          />
                        </div>
                      ) : (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t("capacityNotSet")}
                        </p>
                      )}
                    </div>
                    <Link
                      href={
                        requestedPlan
                          ? `/weddings/${encodeURIComponent(wedding.id)}/plan?plan=${encodeURIComponent(requestedPlan)}`
                          : `/weddings/${encodeURIComponent(wedding.id)}/overview`
                      }
                      className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-petal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {requestedPlan ? t("choosePlanForWedding") : t("openWorkspace")}
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {weddings.data && weddings.data.totalCount > 0 && (
        <Pagination
          page={page}
          pageSize={weddings.data.pageSize}
          totalCount={weddings.data.totalCount}
          onPageChange={setPage}
          disabled={weddings.isFetching}
        />
      )}
    </div>
  );
}
