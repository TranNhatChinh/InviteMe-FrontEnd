"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { useLocale } from "@/i18n/language-context";
import { formatDate } from "@/i18n/format";
import { TemplateThumbnail } from "../components/template-thumbnail";
import { parseStudioDocument } from "../schemas/document";
import { updateStudioBackups, type StudioBackup } from "./studio-backup-store";

type Props = {
  scope: string;
  title?: string;
  document: string | null;
  onRestore: (document: string) => void;
};

export function StudioBackups({ scope, title, document, onRestore }: Props) {
  const { t } = useTranslation("templateStudio");
  const { language } = useLocale();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<boolean>();
  const [entries, setEntries] = useState<StudioBackup[]>([]);
  const [preview, setPreview] = useState<string>();
  const [failed, setFailed] = useState(false);
  const latest = useRef({ document, title });
  const checkpoint = useRef<string | null>(null);

  useEffect(() => {
    latest.current = { document, title };
    if (checkpoint.current === null && document) checkpoint.current = document;
  }, [document, title]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const state = await updateStudioBackups(scope);
        if (!active) return;
        setEnabled(state.enabled);
        setEntries(state.entries);
        setFailed(false);
      } catch {
        if (active) setFailed(true);
      }
    };
    void refresh();
    const timer = window.setInterval(async () => {
      const current = latest.current;
      if (!current.document || current.document === checkpoint.current) return;
      try {
        const validated = JSON.stringify(parseStudioDocument(current.document));
        const state = await updateStudioBackups(scope, (previous) => {
          if (!previous.enabled || previous.entries[0]?.document === validated) return previous;
          return {
            ...previous,
            entries: [
              {
                id: crypto.randomUUID(),
                savedAt: Date.now(),
                title: current.title,
                document: validated,
              },
              ...previous.entries,
            ].slice(0, 3),
          };
        });
        if (!active) return;
        if (state.enabled) checkpoint.current = current.document;
        setEnabled(state.enabled);
        setEntries(state.entries);
        setFailed(false);
      } catch {
        if (active) setFailed(true);
      }
    }, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [scope]);

  async function change(update?: Parameters<typeof updateStudioBackups>[1]) {
    try {
      const state = await updateStudioBackups(scope, update);
      setEnabled(state.enabled);
      setEntries(state.entries);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  function close() {
    setOpen(false);
    setPreview(undefined);
  }

  const selected = entries.find((entry) => entry.id === preview);
  return (
    <>
      <button
        type="button"
        title={
          entries[0]
            ? t("backup.lastSaved", {
                time: formatDate(entries[0].savedAt, language, {
                  dateStyle: "short",
                  timeStyle: "short",
                }),
              })
            : undefined
        }
        onClick={() => {
          setOpen(true);
          void change();
        }}
      >
        {t(
          failed
            ? "backup.unavailable"
            : enabled === undefined
              ? "backup.title"
              : enabled
                ? "backup.on"
                : "backup.off",
        )}
      </button>
      <Modal
        open={open}
        onClose={close}
        title={t("backup.title")}
        description={t("backup.description")}
      >
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 border-b pb-4">
            <span>
              <span className="block font-medium">{t("backup.autosave")}</span>
              <span className="text-sm text-muted-foreground">{t("backup.interval")}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              disabled={enabled === undefined}
              checked={enabled === true}
              onChange={(event) => {
                const next = event.currentTarget.checked;
                void change((previous) => ({ ...previous, enabled: next }));
              }}
            />
          </label>
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              {t("backup.error")}
            </p>
          )}
          <div className="flex justify-between gap-2 text-sm">
            <strong>{t("backup.local")}</strong>
            <span>{t("backup.count", { count: entries.length })}</span>
          </div>
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("backup.empty")}</p>
          )}
          {entries.map((entry, index) => (
            <section key={entry.id} className="space-y-2 rounded-xl border p-4">
              <div className="flex justify-between gap-2">
                <h3 className="font-medium">{entry.title || title || t("backup.untitled")}</h3>
                {index === 0 && (
                  <span className="text-xs text-muted-foreground">{t("backup.latest")}</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDate(entry.savedAt, language, { dateStyle: "short", timeStyle: "short" })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-expanded={preview === entry.id}
                  onClick={() => setPreview(preview === entry.id ? undefined : entry.id)}
                >
                  {t("header.preview")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!window.confirm(t("backup.confirmRestore"))) return;
                    onRestore(entry.document);
                    close();
                  }}
                >
                  {t("backup.restore")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    if (!window.confirm(t("backup.confirmDelete"))) return;
                    void change((previous) => ({
                      ...previous,
                      entries: previous.entries.filter((item) => item.id !== entry.id),
                    }));
                  }}
                >
                  {t("backup.delete")}
                </Button>
              </div>
              {selected?.id === entry.id && (
                <div className="mx-auto max-h-72 w-full max-w-60 overflow-auto rounded border">
                  <TemplateThumbnail document={parseStudioDocument(entry.document)} fluid full />
                </div>
              )}
            </section>
          ))}
          <details className="border-t pt-4 text-sm">
            <summary className="cursor-pointer font-medium">{t("backup.where")}</summary>
            <p className="mt-2 text-muted-foreground">{t("backup.retention")}</p>
          </details>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => void change()}>
              {t("backup.refresh")}
            </Button>
            <Button type="button" variant="outline" onClick={close}>
              {t("backup.close")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
