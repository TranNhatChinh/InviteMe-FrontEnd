"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { CheckCheck, ChevronLeft, ChevronRight, LoaderCircle, Search, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { toggleRecipientPage, type MessageRecipient } from "@/shared/lib/message-recipients";

const PAGE_SIZE = 20;

export function MessageRecipientPicker({
  recipients,
  selectedIds,
  onChange,
  loading = false,
  failed = false,
  onRetry,
  disabled = false,
}: {
  recipients: MessageRecipient[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("common", { keyPrefix: "messageRecipients" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filtered = useMemo(
    () =>
      recipients.filter((guest) =>
        [guest.recipientName, guest.groupName, guest.email, guest.phone].some((value) =>
          value?.toLocaleLowerCase().includes(deferredSearch),
        ),
      ),
    [recipients, deferredSearch],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageSelected = visible.filter((guest) => selected.has(guest.id)).length;
  const allSelected = recipients.length > 0 && recipients.every((guest) => selected.has(guest.id));
  const unavailable = disabled || loading || failed;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span aria-live="polite" className="inline-flex items-center gap-2 text-sm font-medium">
          <Users className="size-4 text-primary-hover" aria-hidden="true" />
          {t("selected", { count: selectedIds.length, total: recipients.length })}
        </span>
        {selectedIds.length > 0 && (
          <button
            type="button"
            className="text-xs font-medium text-primary-hover underline-offset-4 hover:underline disabled:opacity-50"
            onClick={() => onChange([])}
            disabled={unavailable}
          >
            {t("clear")}
          </button>
        )}
      </div>
      <Button
        type="button"
        variant={allSelected ? "default" : "outline"}
        className="w-full justify-center"
        disabled={unavailable || !recipients.length}
        onClick={() => onChange(recipients.map((guest) => guest.id))}
      >
        {loading ? <LoaderCircle className="animate-spin" /> : <CheckCheck />}
        {allSelected
          ? t("allSelected", { count: recipients.length })
          : t("selectAll", { count: recipients.length })}
      </Button>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("allPagesHint")}</p>
      <label className="relative block">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground"
        />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          disabled={loading || failed}
          aria-label={t("search")}
          placeholder={t("search")}
          className="h-11 w-full rounded-xl border bg-background pl-9 pr-3 text-sm"
        />
      </label>
      {loading ? (
        <p
          role="status"
          className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin" />
          {t("loading")}
        </p>
      ) : failed ? (
        <div role="alert" className="rounded-xl bg-destructive/5 p-4 text-sm text-destructive">
          <p>{t("failed")}</p>
          <Button type="button" className="mt-3" variant="outline" size="sm" onClick={onRetry}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <label className="flex items-center gap-3 bg-muted/50 px-3 py-2.5 text-xs font-medium">
            <input
              type="checkbox"
              className="size-4 accent-primary-hover"
              checked={visible.length > 0 && pageSelected === visible.length}
              ref={(element) => {
                if (element)
                  element.indeterminate = pageSelected > 0 && pageSelected < visible.length;
              }}
              disabled={disabled || !visible.length}
              onChange={(event) =>
                onChange(
                  toggleRecipientPage(
                    selectedIds,
                    visible.map((guest) => guest.id),
                    event.target.checked,
                  ),
                )
              }
            />
            {t("selectPage")}
          </label>
          <ul className="max-h-72 divide-y overflow-y-auto">
            {visible.map((guest) => (
              <li key={guest.id}>
                <label
                  className={`flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/40 ${selected.has(guest.id) ? "bg-primary/10" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-primary-hover"
                    checked={selected.has(guest.id)}
                    disabled={disabled}
                    aria-label={t("selectGuest", { name: guest.recipientName })}
                    onChange={(event) =>
                      onChange(toggleRecipientPage(selectedIds, [guest.id], event.target.checked))
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {guest.recipientName}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {[guest.groupName, guest.email || guest.phone || t("noContact")]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {!visible.length && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
          )}
        </div>
      )}
      {!loading && !failed && recipients.length > 0 && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t("page", { page: currentPage, pages, count: filtered.length })}</span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={currentPage <= 1}
              aria-label={t("previous")}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={currentPage >= pages}
              aria-label={t("next")}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
