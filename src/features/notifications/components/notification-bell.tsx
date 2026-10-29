"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useRuntime } from "@/core/config/runtime";
import { useLocale } from "@/i18n/language-context";
import { formatDate } from "@/i18n/format";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
  type AppNotification,
} from "../api/notifications.api";
import { notificationHref, notificationText } from "../utils/notification-text";

const PAGE_SIZE = 20;
// The bell also refreshes on wedding realtime events (RSVP / gift changes) while a wedding page is open.
const POLL_MS = 60_000;

export function NotificationBell({ className }: { className?: string }) {
  const { t } = useTranslation("notifications");
  const { language } = useLocale();
  const { api } = useRuntime();
  const cache = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const unread = useQuery({
    queryKey: notificationKeys.unread(),
    queryFn: ({ signal }) => countUnreadNotifications(api, signal),
    refetchInterval: POLL_MS,
  });
  const list = useQuery({
    queryKey: notificationKeys.list(PAGE_SIZE),
    queryFn: ({ signal }) => listNotifications(api, PAGE_SIZE, signal),
    enabled: open,
    refetchInterval: open ? POLL_MS : false,
  });

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const refresh = () => void cache.invalidateQueries({ queryKey: notificationKeys.all });

  async function openItem(item: AppNotification) {
    setOpen(false);
    if (!item.readAt) {
      try {
        await markNotificationRead(api, item.id);
      } finally {
        refresh();
      }
    }
    router.push(notificationHref(item));
  }

  async function readAll() {
    try {
      await markAllNotificationsRead(api);
    } finally {
      refresh();
    }
  }

  const count = unread.data?.count ?? 0;
  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Button
        variant="ghost"
        size="icon"
        className="relative size-11"
        aria-label={count ? `${t("open")} · ${t("unread", { count })}` : t("open")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell aria-hidden="true" />
        {count > 0 && (
          <span className="absolute right-1.5 top-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-5 text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>
      {open && (
        <section
          id={panelId}
          aria-label={t("title")}
          className="absolute right-0 top-12 z-50 flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card shadow-xl"
        >
          <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="text-sm font-semibold">
              {t("title")}
              {count > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {t("unread", { count })}
                </span>
              )}
            </h2>
            {count > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => void readAll()}
              >
                <CheckCheck aria-hidden="true" />
                {t("markAllRead")}
              </Button>
            )}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.isPending && <p className="p-4 text-sm text-muted-foreground">{t("loading")}</p>}
            {list.isError && <p className="p-4 text-sm text-destructive">{t("loadFailed")}</p>}
            {list.data?.items.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
            )}
            <ul>
              {list.data?.items.map((item) => (
                <li key={item.id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                      !item.readAt && "bg-primary/5",
                    )}
                    onClick={() => void openItem(item)}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        item.readAt ? "bg-transparent" : "bg-primary",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block", !item.readAt && "font-medium")}>
                        {notificationText(item, t, language)}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {item.weddingTitle} ·{" "}
                        {formatDate(item.createdAt, language, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
