"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { ApiError } from "@/core/api/api-error";
import { usePermission } from "@/shared/components/permission-guard";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { LoadingState } from "@/shared/feedback/loading-state";
import { ErrorState } from "@/shared/feedback/error-state";
import { listPlanningGuests } from "../api/planning.api";
import {
  wordingApi,
  wordingPresetsSchema,
  wordingVariables,
  type WordingPreset,
  type WordingSettings,
  type WordingPreviewInput,
} from "../api/wording.api";

const settingsKey = (id: string) => ["invitation-wording", id] as const;
type EditablePreset = Omit<WordingPreset, "honorifics"> & { honorificText: string };
const editable = (p: WordingPreset): EditablePreset => {
  const { honorifics, ...rest } = p;
  return { ...rest, honorificText: honorifics.join(", ") };
};
const payload = (presets: EditablePreset[]): WordingPreset[] =>
  presets.map(({ honorificText, ...p }) => ({
    ...p,
    honorifics: honorificText
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
  }));

export function InvitationWording({
  weddingId,
  compact = false,
  onPreview,
}: {
  weddingId: string;
  compact?: boolean;
  onPreview?: (content: string | null) => void;
}) {
  const { t } = useTranslation("guestTools", { keyPrefix: "wording" });
  const { api } = useRuntime();
  const [notice, setNotice] = useState("");
  const settings = useQuery({
    queryKey: settingsKey(weddingId),
    queryFn: ({ signal }) => wordingApi.get(api, weddingId, signal),
    staleTime: Infinity,
  });
  if (settings.isPending) return <LoadingState label={t("loading")} />;
  if (settings.isError)
    return <ErrorState error={settings.error} retry={() => void settings.refetch()} />;
  return (
    <section className="space-y-5">
      <div>
        {compact ? (
          <h3 className="font-medium">{t("title")}</h3>
        ) : (
          <h1 className="font-serif text-3xl">{t("title")}</h1>
        )}
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      {notice && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
          {notice}
        </p>
      )}
      <WordingEditor
        key={`${weddingId}:${settings.data.version}`}
        settings={settings.data}
        compact={compact}
        onPreview={onPreview}
        onSaved={() => setNotice(t("saved"))}
      />
    </section>
  );
}

function WordingEditor({
  settings,
  onSaved,
  compact,
  onPreview,
}: {
  settings: WordingSettings;
  onSaved: () => void;
  compact: boolean;
  onPreview?: (content: string | null) => void;
}) {
  const { t } = useTranslation("guestTools", { keyPrefix: "wording" });
  const { api } = useRuntime();
  const { can } = usePermission();
  const cache = useQueryClient();
  const canEdit = can("WEDDING_EDIT");
  const canPreview = can("GUEST_VIEW");
  const [presets, setPresets] = useState(() => settings.presets.map(editable));
  const [guestId, setGuestId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reloadError, setReloadError] = useState(false);
  const draft = payload(presets);
  const validation = wordingPresetsSchema.safeParse(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.presets);
  const guests = useQuery({
    queryKey: ["wording-guests", settings.weddingId, search, page],
    queryFn: ({ signal }) => listPlanningGuests(api, settings.weddingId, page, search, signal),
    enabled: canPreview,
  });
  const save = useMutation({
    mutationFn: () => wordingApi.save(api, settings.weddingId, settings.version, draft),
    onSuccess: (data) => {
      cache.setQueryData(settingsKey(settings.weddingId), data);
      void cache.invalidateQueries({ queryKey: ["invitation-design", settings.weddingId] });
      onSaved();
    },
  });
  const preview = useMutation({
    mutationFn: (input: WordingPreviewInput) => wordingApi.preview(api, settings.weddingId, input),
  });
  const previewCurrent =
    JSON.stringify(preview.variables) === JSON.stringify({ guestId, presets: draft });
  const previewContent =
    previewCurrent && validation.success ? (preview.data?.content ?? null) : null;
  useEffect(() => {
    onPreview?.(previewContent);
    return () => onPreview?.(null);
  }, [onPreview, previewContent]);
  function update(id: string, change: Partial<EditablePreset>) {
    setPresets((rows) => rows.map((p) => (p.id === id ? { ...p, ...change } : p)));
  }
  function remove(id: string) {
    setPresets((rows) => {
      const remaining = rows.filter((p) => p.id !== id);
      if (!remaining.some((p) => p.isDefault))
        return remaining.map((p, index) => ({ ...p, isDefault: index === 0 }));
      return remaining;
    });
  }
  async function reload() {
    setReloadError(false);
    try {
      const data = await wordingApi.get(api, settings.weddingId);
      cache.setQueryData(settingsKey(settings.weddingId), data);
      void cache.invalidateQueries({ queryKey: ["invitation-design", settings.weddingId] });
      setPresets(data.presets.map(editable));
      save.reset();
      preview.reset();
    } catch {
      setReloadError(true);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (validation.success && canEdit && !save.isPending) save.mutate();
  }
  const issues = validation.success
    ? []
    : [
        ...new Set(
          validation.error.issues.map((issue) =>
            issue.code === "custom" && issue.message.startsWith("wording.validation.")
              ? t(issue.message.slice("wording.".length), issue.params)
              : t("invalid", { label: "{{recipientLabel}}", name: "{{recipientName}}" }),
          ),
        ),
      ];
  return (
    <div
      className={
        compact
          ? "flex min-w-0 flex-col gap-4"
          : "grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"
      }
    >
      <form onSubmit={submit} className={compact ? "order-2 min-w-0 space-y-4" : "space-y-4"}>
        {!canEdit && <p className="text-sm text-muted-foreground">{t("readOnly")}</p>}
        <fieldset disabled={!canEdit || save.isPending} className="space-y-4">
          {presets.map((preset, index) => (
            <details
              key={preset.id}
              open={!compact}
              className={
                compact
                  ? "space-y-3 rounded-lg border bg-card p-3"
                  : "space-y-4 rounded-2xl border bg-card p-5"
              }
            >
              <summary className="cursor-pointer break-words text-sm font-medium">
                {preset.name || t("presetNumber", { number: index + 1 })}
                {preset.isDefault ? t("defaultSuffix") : ""}
              </summary>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-medium">
                  {t("presetNumber", { number: index + 1 })}
                  {preset.isDefault ? t("defaultSuffix") : ""}
                </h2>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={presets.length === 1}
                  onClick={() => remove(preset.id)}
                >
                  {t("remove")}
                </Button>
              </div>
              <label className="block text-sm">
                {t("name")}
                <Input
                  className="mt-1"
                  value={preset.name}
                  maxLength={80}
                  required
                  onChange={(event) => update(preset.id, { name: event.target.value })}
                />
              </label>
              <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
                <label className="block text-sm">
                  {t("honorifics")}
                  <Input
                    className="mt-1"
                    placeholder={t("honorificsPlaceholder")}
                    value={preset.honorificText}
                    onChange={(event) => update(preset.id, { honorificText: event.target.value })}
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t("honorificsHelp")}
                  </span>
                </label>
                <label className="block text-sm">
                  {t("senderPronoun")}
                  <Input
                    className="mt-1"
                    placeholder={t("senderPronounPlaceholder")}
                    value={preset.senderPronoun}
                    maxLength={50}
                    onChange={(event) => update(preset.id, { senderPronoun: event.target.value })}
                  />
                </label>
              </div>
              <label className="block text-sm">
                {t("content")}
                <textarea
                  className="mt-1 min-h-32 w-full rounded-lg border bg-background p-3"
                  value={preset.content}
                  maxLength={2000}
                  required
                  onChange={(event) => update(preset.id, { content: event.target.value })}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {wordingVariables.map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                    onClick={() =>
                      update(preset.id, { content: `${preset.content}{{${variable}}}` })
                    }
                  >{`+ {{${variable}}}`}</button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="default-wording-preset"
                  checked={preset.isDefault}
                  onChange={() =>
                    setPresets((rows) => rows.map((p) => ({ ...p, isDefault: p.id === preset.id })))
                  }
                />
                {t("makeDefault")}
              </label>
            </details>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={presets.length >= 30}
            onClick={() =>
              setPresets((rows) => [
                ...rows,
                {
                  id: crypto.randomUUID(),
                  name: "",
                  content:
                    "Trân trọng mời {{recipientLabel}} đến chung vui cùng {{senderPronoun}} trong ngày cưới.",
                  senderPronoun: "chúng mình",
                  isDefault: false,
                  honorificText: "",
                },
              ])
            }
          >
            {t("add")}
          </Button>
        </fieldset>
        {issues.length > 0 && (
          <ul
            role="alert"
            className="space-y-1 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {issues.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
        {save.isError && (
          <div
            role="alert"
            className="space-y-2 rounded-lg border border-destructive/30 p-3 text-sm"
          >
            <p>
              {save.error instanceof ApiError && save.error.status === 409
                ? t("conflict")
                : t("saveFailed")}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>
              {t("reload")}
            </Button>
          </div>
        )}
        {reloadError && (
          <p role="alert" className="text-sm text-destructive">
            {t("reloadFailed")}
          </p>
        )}
        {canEdit && (
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={!validation.success || (!dirty && settings.version > 0) || save.isPending}
            >
              {save.isPending ? t("saving") : t("save")}
            </Button>
            <span className="text-sm text-muted-foreground">
              {dirty ? t("unsaved") : settings.version === 0 ? t("suggested") : t("savedState")}
            </span>
          </div>
        )}
      </form>
      <aside
        className={
          compact
            ? "order-1 min-w-0 space-y-3 rounded-lg border bg-card p-3"
            : "space-y-4 rounded-2xl border bg-card p-5 xl:sticky xl:top-5"
        }
      >
        <h2 className="text-lg font-medium">{t("previewTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("previewHelp")}</p>
        <dl className="space-y-1 text-xs text-muted-foreground">
          <div>
            <dt className="inline font-medium">recipientLabel: </dt>
            <dd className="inline">{t("variables.recipientLabel")}</dd>
          </div>
          <div>
            <dt className="inline font-medium">recipientName: </dt>
            <dd className="inline">{t("variables.recipientName")}</dd>
          </div>
          <div>
            <dt className="inline font-medium">honorific: </dt>
            <dd className="inline">{t("variables.honorific")}</dd>
          </div>
          <div>
            <dt className="inline font-medium">senderPronoun: </dt>
            <dd className="inline">{t("variables.senderPronoun")}</dd>
          </div>
        </dl>
        {!canPreview ? (
          <p className="text-sm">{t("previewForbidden")}</p>
        ) : (
          <>
            <label className="block text-sm">
              {t("search")}
              <Input
                className="mt-1"
                value={search}
                maxLength={200}
                placeholder={t("searchPlaceholder")}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                  setGuestId("");
                }}
              />
            </label>
            {guests.isPending && (
              <p role="status" className="text-sm">
                {t("loadingGuests")}
              </p>
            )}
            {guests.isError && (
              <ErrorState error={guests.error} retry={() => void guests.refetch()} />
            )}
            {guests.data && (
              <>
                <label className="block text-sm">
                  {t("chooseGuest")}
                  <select
                    className="mt-1 w-full rounded-lg border bg-background p-2"
                    value={guestId}
                    onChange={(event) => setGuestId(event.target.value)}
                  >
                    <option value="">{t("chooseRecipient")}</option>
                    {guests.data.items.map((guest) => (
                      <option key={guest.id} value={guest.id}>
                        {guest.honorific ? `${guest.honorific} ` : ""}
                        {guest.recipientName}
                        {guest.invitationKind === "FAMILY"
                          ? t("familySuffix")
                          : guest.invitationKind === "GROUP"
                            ? t("groupSuffix")
                            : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {!guests.data.items.length && <p className="text-sm">{t("noGuests")}</p>}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => {
                      setPage(page - 1);
                      setGuestId("");
                    }}
                  >
                    {t("pagePrevious")}
                  </Button>
                  <span>{t("pageNumber", { page })}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page * 20 >= guests.data.totalItems}
                    onClick={() => {
                      setPage(page + 1);
                      setGuestId("");
                    }}
                  >
                    {t("pageNext")}
                  </Button>
                </div>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={!guestId || !validation.success || preview.isPending}
              onClick={() => preview.mutate({ guestId, presets: draft })}
            >
              {preview.isPending ? t("previewing") : t("preview")}
            </Button>
            {previewCurrent && preview.isError && <ErrorState error={preview.error} />}
            {previewCurrent && preview.data && (
              <div aria-live="polite" className="space-y-3 border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  {t("previewPreset", { name: preview.data.presetName })}
                  {preview.data.usedDefault ? t("usedDefault") : ""}
                </p>
                <p className="whitespace-pre-wrap break-words font-serif text-xl leading-relaxed">
                  {preview.data.content}
                </p>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
