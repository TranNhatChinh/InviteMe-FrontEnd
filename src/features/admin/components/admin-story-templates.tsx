"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Monitor, Plus, Search, Smartphone, Tablet, Upload } from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import {
  adminApi,
  adminStoryTemplateSchema,
  storyTemplateAdminApi,
  storyTemplateConfigSchema,
  storyTemplateMetaApi,
  type AdminStoryTemplate,
  type StoryTemplateConfig,
} from "../api/admin.api";
import { AdminStoryTemplatePreview } from "./admin-story-template-preview";
import { z } from "zod";

const catalogBundleSchema = z
  .object({
    format: z.literal("inviteme-story-template-catalog"),
    formatVersion: z.literal(1),
    exportedAt: z.string().optional(),
    templates: z.array(storyTemplateConfigSchema).min(1).max(50),
  })
  .strict()
  .superRefine((bundle, context) => {
    const keys = new Set<string>();
    bundle.templates.forEach((config, index) => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.key) || config.key.length > 80)
        context.addIssue({
          code: "custom",
          path: ["templates", index, "key"],
          message: "Mẫu có key không hợp lệ.",
        });
      if (keys.has(config.key))
        context.addIssue({
          code: "custom",
          path: ["templates", index, "key"],
          message: `Key ${config.key} bị lặp trong file.`,
        });
      keys.add(config.key);
    });
  });

type CatalogFilter = "all" | "published" | "draft" | "archived";
type PreviewViewport = "desktop" | "tablet" | "mobile";
type Confirmation = "publish" | "archive" | null;
type PendingImport = { templates: StoryTemplateConfig[]; existingKeys: string[] };
type TemplateSectionStyle = NonNullable<StoryTemplateConfig["sections"][number]["style"]>;

const colorFields = ["primary", "background", "accent", "text"] as const;
const previewViewports = [
  { id: "desktop", Icon: Monitor },
  { id: "tablet", Icon: Tablet },
  { id: "mobile", Icon: Smartphone },
] as const;
const emptyTemplates: AdminStoryTemplate[] = [];

function createEmptyTemplate(): StoryTemplateConfig {
  const colors = { primary: "#F4DADC", background: "#FFFAF5", accent: "#805459", text: "#3A2A2C" };
  return {
    key: "",
    name: "",
    sections: [
      { type: "hero", variant: "floral" },
      { type: "couple", variant: "alternating" },
      { type: "countdown", variant: "classic" },
      { type: "events", variant: "cards" },
      { type: "gallery", variant: "grid" },
      { type: "rsvp", variant: "default" },
    ],
    theme: { colors, fontHeading: "Georgia", fontBody: "Georgia" },
    palettes: [{ id: "blush", label: "Hồng phấn", colors }],
    allowedFonts: ["Georgia"],
    accessTier: "UNCLASSIFIED",
    category: null,
    previewImageUrl: null,
  };
}

function statusOf(template: AdminStoryTemplate): Exclude<CatalogFilter, "all"> {
  if (template.isArchived) return "archived";
  return template.published ? "published" : "draft";
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const safeColor = /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  return (
    <label className="grid gap-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={safeColor}
          aria-label={label}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="size-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
        />
        <Input
          value={value}
          maxLength={7}
          aria-label={`${label} HEX`}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 font-mono text-xs uppercase"
        />
      </span>
    </label>
  );
}

export function AdminStoryTemplates() {
  const { api } = useRuntime();
  const { t } = useTranslation("ui");
  const { t: adminT } = useTranslation("admin");
  const cache = useQueryClient();
  const importInput = useRef<HTMLInputElement>(null);
  const query = useQuery({
    queryKey: ["admin-story-templates"],
    queryFn: () => storyTemplateAdminApi.list(api),
  });
  const permissions = useQuery({
    queryKey: ["admin-my-permissions"],
    queryFn: ({ signal }) => adminApi.myPermissions(api, signal),
  });
  const variantsQuery = useQuery({
    queryKey: ["story-template-variants"],
    queryFn: () => storyTemplateMetaApi.variants(api),
    staleTime: 300_000,
  });
  const fontsQuery = useQuery({
    queryKey: ["story-template-fonts"],
    queryFn: () => storyTemplateMetaApi.fonts(api),
    staleTime: 300_000,
  });

  const canManage = permissions.data?.includes("ADMIN_TEMPLATES_MANAGE") ?? false;
  const [selected, setSelected] = useState<AdminStoryTemplate | null>(null);
  const [form, setForm] = useState<StoryTemplateConfig | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");
  const [previewVersion, setPreviewVersion] = useState<"draft" | "published">("draft");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);

  const templates = query.data ?? emptyTemplates;
  const filtered = useMemo(
    () =>
      templates.filter((row) => {
        const haystack = `${row.name} ${row.key} ${row.draft.category ?? ""}`.toLocaleLowerCase();
        return (
          haystack.includes(search.trim().toLocaleLowerCase()) &&
          (filter === "all" || statusOf(row) === filter)
        );
      }),
    [filter, search, templates],
  );
  const counts = useMemo(
    () => ({
      published: templates.filter((row) => statusOf(row) === "published").length,
      draft: templates.filter((row) => statusOf(row) === "draft").length,
      archived: templates.filter((row) => statusOf(row) === "archived").length,
    }),
    [templates],
  );
  const selectedTemplate = selected
    ? (templates.find((row) => row.id === selected.id) ?? selected)
    : null;
  const dirty = Boolean(
    form &&
    (selectedTemplate
      ? JSON.stringify(form) !== JSON.stringify(selectedTemplate.draft)
      : JSON.stringify(form) !== JSON.stringify(createEmptyTemplate())),
  );
  const chosenRows = templates.filter((row) => selectedIds.has(row.id));
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((row) => selectedIds.has(row.id));
  const publishedPreview = previewVersion === "published" ? selectedTemplate?.published : null;
  const previewConfig = canManage
    ? (publishedPreview ?? form)
    : (selectedTemplate?.published ?? selectedTemplate?.draft ?? null);
  const currentTemplateVersion =
    previewVersion === "published" && selectedTemplate?.published
      ? selectedTemplate.publishedVersion
      : (selectedTemplate?.version ?? 1);

  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ["admin-story-templates"] });
  };
  const edit = (row: AdminStoryTemplate | null) => {
    setSelected(row);
    setForm(structuredClone(row?.draft ?? createEmptyTemplate()));
    setPreviewVersion("draft");
    setError("");
    setMessage("");
  };
  const change = (next: StoryTemplateConfig) => setForm(next);

  const updateDefaultContent = (
    sectionIndex: number,
    field: "title" | "intro" | "eyebrow" | "subtitle" | "submitLabel",
    value: string,
  ) => {
    if (!form) return;
    const sections = form.sections.map((section, index) => {
      if (index !== sectionIndex) return section;
      const defaultContent = { ...(section.defaultContent ?? {}) };
      if (value.trim()) defaultContent[field] = value;
      else delete defaultContent[field];
      return { ...section, defaultContent: Object.keys(defaultContent).length ? defaultContent : undefined };
    });
    change({ ...form, sections });
  };

  const updateSectionStyle = (
    sectionIndex: number,
    field: keyof TemplateSectionStyle,
    value: TemplateSectionStyle[keyof TemplateSectionStyle],
  ) => {
    if (!form) return;
    change({
      ...form,
      sections: form.sections.map((section, index) =>
        index === sectionIndex
          ? { ...section, style: { ...(section.style ?? {}), [field]: value } as TemplateSectionStyle }
          : section,
      ),
    });
  };

  const action = async (run: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = adminStoryTemplateSchema.parse(await run());
      setSelected(result);
      setForm(structuredClone(result.draft));
      setPreviewVersion("draft");
      setMessage(success);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("storyTemplates.actionFailed"));
      await refresh();
    } finally {
      setBusy(false);
      setConfirmation(null);
    }
  };

  const saveDraft = () => {
    if (!form) return;
    const draft = storyTemplateConfigSchema.parse({
      ...form,
      key: form.key.trim(),
      name: form.name.trim(),
    });
    void action(
      () =>
        selectedTemplate
          ? storyTemplateAdminApi.save(api, selectedTemplate.id, selectedTemplate.version, draft)
          : storyTemplateAdminApi.create(api, draft.key, draft),
      t("storyTemplates.draftSaved"),
    );
  };

  const reorderSection = (index: number, target: number) => {
    if (!form || target < 1 || target >= form.sections.length) return;
    const sections = [...form.sections];
    const [moved] = sections.splice(index, 1);
    if (!moved) return;
    sections.splice(target, 0, moved);
    change({ ...form, sections });
  };

  const toggleFont = (font: string, checked: boolean) => {
    if (!form) return;
    const allowedFonts = checked
      ? [...form.allowedFonts, font]
      : form.allowedFonts.filter((item) => item !== font);
    if (allowedFonts.length === 0) return;
    const fallback = allowedFonts[0] ?? "Georgia";
    change({
      ...form,
      allowedFonts,
      theme: {
        ...form.theme,
        fontHeading: allowedFonts.includes(form.theme.fontHeading)
          ? form.theme.fontHeading
          : fallback,
        fontBody: allowedFonts.includes(form.theme.fontBody) ? form.theme.fontBody : fallback,
      },
    });
  };

  const toggleVisibleSelection = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) filtered.forEach((row) => next.delete(row.id));
      else filtered.forEach((row) => next.add(row.id));
      return next;
    });
  };

  const exportSelected = () => {
    if (chosenRows.length === 0) return;
    const bundle = {
      format: "inviteme-story-template-catalog",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      templates: chosenRows.map((row) => structuredClone(row.published ?? row.draft)),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "inviteme-story-templates.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(t("storyTemplates.exportReady", { count: chosenRows.length }));
  };

  const readImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError("");
    setMessage("");
    try {
      const bundle = catalogBundleSchema.parse(JSON.parse(await file.text()));
      const existing = new Set(templates.map((row) => row.key));
      setPendingImport({
        templates: bundle.templates,
        existingKeys: bundle.templates
          .filter((item) => existing.has(item.key))
          .map((item) => item.key),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("storyTemplates.invalidImport"));
    }
  };

  const importTemplates = async () => {
    if (!pendingImport) return;
    const keysAlreadyInDatabase = new Set(pendingImport.existingKeys);
    const toCreate = pendingImport.templates.filter((item) => !keysAlreadyInDatabase.has(item.key));
    let imported = 0;
    const failed: string[] = [];
    setBusy(true);
    setError("");
    setMessage("");
    for (const config of toCreate) {
      try {
        const created = await storyTemplateAdminApi.create(api, config.key, config);
        await storyTemplateAdminApi.publish(api, created.id, created.version);
        imported++;
      } catch (cause) {
        failed.push(
          `${config.key}: ${cause instanceof Error ? cause.message : t("storyTemplates.actionFailed")}`,
        );
      }
    }
    await refresh();
    setBusy(false);
    setPendingImport(null);
    setMessage(
      t("storyTemplates.importResult", {
        imported,
        skipped: pendingImport.existingKeys.length,
        failed: failed.length,
      }),
    );
    if (failed.length > 0) setError(failed.join("\n"));
  };

  const setColor = (key: (typeof colorFields)[number], color: string) => {
    if (!form) return;
    change({ ...form, theme: { ...form.theme, colors: { ...form.theme.colors, [key]: color } } });
  };

  const addSection = (type: string) => {
    if (!form) return;
    const variant = variantsQuery.data?.[type]?.[0];
    if (
      !variant ||
      form.sections.some((section) => section.type === type) ||
      form.sections.length >= 12
    )
      return;
    change({ ...form, sections: [...form.sections, { type, variant }] });
  };

  const updatePalette = (
    index: number,
    patch: Partial<StoryTemplateConfig["palettes"][number]>,
  ) => {
    if (!form) return;
    change({
      ...form,
      palettes: form.palettes.map((palette, itemIndex) =>
        itemIndex === index ? { ...palette, ...patch } : palette,
      ),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("storyTemplates.title")}
        description={t("storyTemplates.description")}
        action={
          canManage ? (
            <Button onClick={() => edit(null)}>
              <Plus className="mr-2 size-4" />
              {t("storyTemplates.create")}
            </Button>
          ) : undefined
        }
      />

      {permissions.data && !canManage && (
        <p className="border-l-2 border-primary px-4 py-2 text-sm text-muted-foreground">
          {adminT("templatesReadOnly")}
        </p>
      )}

      {query.isPending && <LoadingState label={t("storyTemplates.loading")} />}
      {query.isError && <ErrorState error={query.error} retry={() => void query.refetch()} />}

      {query.data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border pb-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">{counts.published}</span>{" "}
              {t("storyTemplates.publishedCount")}
              <span className="mx-3 text-border">·</span>
              <span className="font-semibold tabular-nums text-foreground">
                {counts.draft}
              </span>{" "}
              {t("storyTemplates.draftCount")}
              <span className="mx-3 text-border">·</span>
              <span className="font-semibold tabular-nums text-foreground">
                {counts.archived}
              </span>{" "}
              {t("storyTemplates.archivedCount")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={chosenRows.length === 0}
                onClick={exportSelected}
              >
                <Download className="mr-2 size-4" />
                {t("storyTemplates.exportSelected", { count: chosenRows.length })}
              </Button>
              {canManage && (
                <>
                  <input
                    ref={importInput}
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    onChange={(event) => void readImportFile(event)}
                    aria-label={t("storyTemplates.importFile")}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => importInput.current?.click()}
                  >
                    <Upload className="mr-2 size-4" />
                    {t("storyTemplates.import")}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="min-w-0" aria-label={t("storyTemplates.catalogLabel")}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">{t("storyTemplates.catalogLabel")}</h2>
                <span className="font-mono text-xs text-muted-foreground">
                  {filtered.length}/{templates.length}
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("storyTemplates.search")}
                    className="h-10 pl-9"
                    aria-label={t("storyTemplates.search")}
                  />
                </label>
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as CatalogFilter)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  aria-label={t("storyTemplates.filter")}
                >
                  {(["all", "published", "draft", "archived"] as const).map((value) => (
                    <option key={value} value={value}>
                      {t(`storyTemplates.filters.${value}`)}
                    </option>
                  ))}
                </select>
                <label className="flex min-h-9 items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleVisibleSelection}
                    className="size-4 accent-primary"
                  />
                  {t("storyTemplates.selectVisible")}
                </label>
              </div>

              <div className="mt-2 divide-y divide-border border-y border-border">
                {filtered.map((row) => {
                  const active = selectedTemplate?.id === row.id;
                  const colors = row.draft.theme.colors;
                  return (
                    <div
                      key={row.id}
                      className={`flex items-start gap-2 py-3 ${active ? "border-l-2 border-primary bg-primary/5 pl-2" : "pl-1"}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() =>
                          setSelectedIds((current) => {
                            const next = new Set(current);
                            if (next.has(row.id)) next.delete(row.id);
                            else next.add(row.id);
                            return next;
                          })
                        }
                        className="mt-1 size-4 shrink-0 accent-primary"
                        aria-label={t("storyTemplates.selectTemplate", { name: row.name })}
                      />
                      <button
                        type="button"
                        onClick={() => edit(row)}
                        className="min-w-0 flex-1 text-left"
                        aria-current={active ? "true" : undefined}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {row.name}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {t(`storyTemplates.status.${statusOf(row)}`)}
                          </span>
                        </span>
                        <span className="mt-1 flex items-center justify-between gap-2">
                          <code className="truncate font-mono text-[11px] text-muted-foreground">
                            {row.key} · v{row.version}
                          </code>
                          <span
                            className="flex shrink-0 gap-1"
                            aria-label={t("storyTemplates.palettePreview")}
                          >
                            {colorFields.map((key) => (
                              <span
                                key={key}
                                className="size-3 rounded-full border border-black/10"
                                style={{ backgroundColor: colors[key] }}
                              />
                            ))}
                          </span>
                        </span>
                      </button>
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {templates.length ? t("storyTemplates.noResults") : t("storyTemplates.empty")}
                  </p>
                )}
              </div>
            </aside>

            <section className="min-w-0">
              {form && canManage ? (
                <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.88fr)]">
                  <div className="min-w-0 space-y-5">
                    <section className="space-y-4 border-b border-border pb-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {selectedTemplate
                              ? t(`storyTemplates.status.${statusOf(selectedTemplate)}`)
                              : t("storyTemplates.newTemplate")}
                          </p>
                          <h2 className="mt-1 font-display text-2xl text-foreground">
                            {form.name || t("storyTemplates.untitled")}
                          </h2>
                        </div>
                        {selectedTemplate?.published && (
                          <div
                            className="flex shrink-0 gap-1"
                            role="group"
                            aria-label={t("storyTemplates.previewVersion")}
                          >
                            <Button
                              size="sm"
                              variant={previewVersion === "draft" ? "default" : "outline"}
                              onClick={() => setPreviewVersion("draft")}
                            >
                              {t("storyTemplates.draft")}
                            </Button>
                            <Button
                              size="sm"
                              variant={previewVersion === "published" ? "default" : "outline"}
                              onClick={() => setPreviewVersion("published")}
                            >
                              {t("storyTemplates.published")}
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1.5 text-xs text-muted-foreground">
                          {t("storyTemplates.nameLabel")}
                          <Input
                            value={form.name}
                            onChange={(event) => change({ ...form, name: event.target.value })}
                            maxLength={120}
                            className="h-10 text-sm"
                          />
                        </label>
                        <label className="grid gap-1.5 text-xs text-muted-foreground">
                          {t("storyTemplates.keyLabel")}
                          <Input
                            value={form.key}
                            disabled={Boolean(selectedTemplate)}
                            onChange={(event) =>
                              change({
                                ...form,
                                key: event.target.value.toLowerCase().replace(/\s+/g, "-"),
                              })
                            }
                            maxLength={80}
                            className="h-10 font-mono text-sm"
                          />
                        </label>
                        <label className="grid gap-1.5 text-xs text-muted-foreground">
                          {t("storyTemplates.categoryLabel")}
                          <Input
                            value={form.category ?? ""}
                            onChange={(event) =>
                              change({ ...form, category: event.target.value || null })
                            }
                            maxLength={80}
                            className="h-10 text-sm"
                            placeholder={t("storyTemplates.categoryPlaceholder")}
                          />
                        </label>
                        <label className="grid gap-1.5 text-xs text-muted-foreground">
                          {t("storyTemplates.accessLabel")}
                          <select
                            value={form.accessTier}
                            onChange={(event) =>
                              change({
                                ...form,
                                accessTier: event.target.value as StoryTemplateConfig["accessTier"],
                              })
                            }
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="UNCLASSIFIED">
                              {t("storyTemplates.access.unclassified")}
                            </option>
                            <option value="FREE">{t("storyTemplates.access.free")}</option>
                            <option value="PREMIUM">{t("storyTemplates.access.premium")}</option>
                          </select>
                        </label>
                      </div>
                    </section>

                    <section className="space-y-3 border-b border-border pb-5">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold">
                            {t("storyTemplates.sectionsTitle")}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("storyTemplates.sectionsHelp")}
                          </p>
                        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                          {t("storyTemplates.defaultContentHelp")}
                        </p>
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">
                          {form.sections.length}/12
                        </span>
                      </div>
                      <ol className="divide-y divide-border border-y border-border">
                        {form.sections.map((section, index) => (
                          <li
                            key={section.type}
                            className="py-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="w-6 font-mono text-xs text-muted-foreground">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <span className="min-w-28 flex-1 text-sm text-foreground">
                                {t(`storyTemplates.sectionTypes.${section.type}`, {
                                  defaultValue: section.type,
                                })}
                              </span>
                              <select
                                value={section.variant}
                                onChange={(event) =>
                                  change({
                                    ...form,
                                    sections: form.sections.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, variant: event.target.value }
                                        : item,
                                    ),
                                  })
                                }
                                disabled={!variantsQuery.data}
                                className="h-9 min-w-32 rounded-md border border-input bg-background px-2 text-xs"
                                aria-label={t("storyTemplates.variantFor", {
                                  section: t(`storyTemplates.sectionTypes.${section.type}`, {
                                    defaultValue: section.type,
                                  }),
                                })}
                              >
                                {(variantsQuery.data?.[section.type] ?? [section.variant]).map(
                                  (variant) => (
                                    <option key={variant} value={variant}>
                                      {t(`storyTemplates.variants.${variant}`, {
                                        defaultValue: variant,
                                      })}
                                    </option>
                                  ),
                                )}
                              </select>
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={index <= 1}
                                  aria-label={t("storyTemplates.moveUp")}
                                  onClick={() => reorderSection(index, index - 1)}
                                >
                                  ↑
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={index === form.sections.length - 1}
                                  aria-label={t("storyTemplates.moveDown")}
                                  onClick={() => reorderSection(index, index + 1)}
                                >
                                  ↓
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={section.type === "hero" || section.type === "rsvp"}
                                  aria-label={t("storyTemplates.removeSection")}
                                  onClick={() =>
                                    change({
                                      ...form,
                                      sections: form.sections.filter(
                                        (_, itemIndex) => itemIndex !== index,
                                      ),
                                    })
                                  }
                                >
                                  ×
                                </Button>
                              </div>
                            </div>
                            <details className="mt-2 rounded-md bg-muted/30 px-3 py-2">
                              <summary className="cursor-pointer text-xs font-medium text-foreground">
                                {t("storyTemplates.defaultsTitle")}
                              </summary>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <label className="grid gap-1 text-xs text-muted-foreground">
                                  {t("storyTemplates.defaultTitleLabel")}
                                  <Input
                                    value={section.defaultContent?.title ?? ""}
                                    maxLength={150}
                                    onChange={(event) => updateDefaultContent(index, "title", event.target.value)}
                                    className="h-9 text-sm"
                                  />
                                </label>
                                {section.type !== "hero" && <label className="grid gap-1 text-xs text-muted-foreground">
                                  {t("storyTemplates.defaultIntroLabel")}
                                  <textarea
                                    value={section.defaultContent?.intro ?? ""}
                                    maxLength={section.type === "couple" ? 1000 : 500}
                                    onChange={(event) => updateDefaultContent(index, "intro", event.target.value)}
                                    rows={2}
                                    className="min-h-9 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  />
                                </label>}
                                {section.type === "hero" && <>
                                  <label className="grid gap-1 text-xs text-muted-foreground">
                                    {t("storyTemplates.defaultEyebrowLabel")}
                                    <Input
                                      value={section.defaultContent?.eyebrow ?? ""}
                                      maxLength={120}
                                      onChange={(event) => updateDefaultContent(index, "eyebrow", event.target.value)}
                                      className="h-9 text-sm"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs text-muted-foreground">
                                    {t("storyTemplates.defaultSubtitleLabel")}
                                    <Input
                                      value={section.defaultContent?.subtitle ?? ""}
                                      maxLength={500}
                                      onChange={(event) => updateDefaultContent(index, "subtitle", event.target.value)}
                                      className="h-9 text-sm"
                                    />
                                  </label>
                                </>}
                                {section.type === "rsvp" && <label className="grid gap-1 text-xs text-muted-foreground">
                                  {t("storyTemplates.defaultSubmitLabel")}
                                  <Input
                                    value={section.defaultContent?.submitLabel ?? ""}
                                    maxLength={60}
                                    onChange={(event) => updateDefaultContent(index, "submitLabel", event.target.value)}
                                    className="h-9 text-sm"
                                  />
                                </label>}
                              </div>
                            </details>
                            <details className="mt-2 rounded-md bg-muted/30 px-3 py-2">
                              <summary className="cursor-pointer text-xs font-medium text-foreground">
                                {t("storyTemplates.sectionStyleTitle")}
                              </summary>
                              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                {t("storyTemplates.sectionStyleHelp")}
                              </p>
                              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                <label className="grid gap-1 text-xs text-muted-foreground">
                                  {t("storyTemplates.sectionBackground")}
                                  <select
                                    value={section.style?.background ?? "default"}
                                    onChange={(event) => updateSectionStyle(index, "background", event.target.value as TemplateSectionStyle["background"])}
                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                                  >
                                    <option value="default">{t("storyTemplates.sectionBackgrounds.default")}</option>
                                    <option value="soft">{t("storyTemplates.sectionBackgrounds.soft")}</option>
                                    <option value="accent">{t("storyTemplates.sectionBackgrounds.accent")}</option>
                                  </select>
                                </label>
                                <label className="grid gap-1 text-xs text-muted-foreground">
                                  {t("storyTemplates.sectionSpacing")}
                                  <select
                                    value={section.style?.spacing ?? "normal"}
                                    onChange={(event) => updateSectionStyle(index, "spacing", event.target.value as TemplateSectionStyle["spacing"])}
                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                                  >
                                    <option value="compact">{t("storyTemplates.sectionSpacings.compact")}</option>
                                    <option value="normal">{t("storyTemplates.sectionSpacings.normal")}</option>
                                    <option value="spacious">{t("storyTemplates.sectionSpacings.spacious")}</option>
                                  </select>
                                </label>
                                <label className="grid gap-1 text-xs text-muted-foreground">
                                  {t("storyTemplates.sectionAnimation")}
                                  <select
                                    value={section.style?.animation ?? "none"}
                                    onChange={(event) => updateSectionStyle(index, "animation", event.target.value as TemplateSectionStyle["animation"])}
                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                                  >
                                    <option value="none">{t("storyTemplates.sectionAnimations.none")}</option>
                                    <option value="fade">{t("storyTemplates.sectionAnimations.fade")}</option>
                                  </select>
                                </label>
                              </div>
                            </details>
                          </li>
                        ))}
                      </ol>
                      <label className="grid max-w-sm gap-1.5 text-xs text-muted-foreground">
                        {t("storyTemplates.addSection")}
                        <select
                          value=""
                          onChange={(event) => addSection(event.target.value)}
                          disabled={!variantsQuery.data || form.sections.length >= 12}
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">{t("storyTemplates.addSectionPrompt")}</option>
                          {Object.keys(variantsQuery.data ?? {})
                            .filter(
                              (type) => !form.sections.some((section) => section.type === type),
                            )
                            .map((type) => (
                              <option key={type} value={type}>
                                {t(`storyTemplates.sectionTypes.${type}`, { defaultValue: type })}
                              </option>
                            ))}
                        </select>
                      </label>
                    </section>

                    <section className="space-y-3 border-b border-border pb-5">
                      <div>
                        <h3 className="text-sm font-semibold">{t("storyTemplates.themeTitle")}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("storyTemplates.themeHelp")}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {colorFields.map((key) => (
                          <ColorField
                            key={key}
                            label={t(`storyTemplates.colors.${key}`)}
                            value={form.theme.colors[key]}
                            onChange={(value) => setColor(key, value)}
                          />
                        ))}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {(["fontHeading", "fontBody"] as const).map((key) => (
                          <label key={key} className="grid gap-1.5 text-xs text-muted-foreground">
                            {t(`storyTemplates.fonts.${key}`)}
                            <select
                              value={form.theme[key]}
                              onChange={(event) =>
                                change({
                                  ...form,
                                  theme: { ...form.theme, [key]: event.target.value },
                                })
                              }
                              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            >
                              {form.allowedFonts.map((font) => (
                                <option key={font} value={font}>
                                  {font}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-3 border-b border-border pb-5">
                      <div>
                        <h3 className="text-sm font-semibold">
                          {t("storyTemplates.palettesTitle")}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("storyTemplates.palettesHelp")}
                        </p>
                      </div>
                      <div className="space-y-4">
                        {form.palettes.map((palette, index) => (
                          <fieldset
                            key={palette.id}
                            className="space-y-3 border-t border-border pt-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <label className="grid flex-1 gap-1.5 text-xs text-muted-foreground">
                                {t("storyTemplates.paletteName")}
                                <Input
                                  value={palette.label}
                                  maxLength={80}
                                  onChange={(event) =>
                                    updatePalette(index, { label: event.target.value })
                                  }
                                  className="h-9 text-sm"
                                />
                              </label>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={form.palettes.length <= 1}
                                onClick={() =>
                                  change({
                                    ...form,
                                    palettes: form.palettes.filter(
                                      (_, itemIndex) => itemIndex !== index,
                                    ),
                                  })
                                }
                              >
                                {t("storyTemplates.removePalette")}
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {colorFields.map((key) => (
                                <ColorField
                                  key={key}
                                  label={t(`storyTemplates.colors.${key}`)}
                                  value={palette.colors[key]}
                                  onChange={(value) =>
                                    updatePalette(index, {
                                      colors: { ...palette.colors, [key]: value },
                                    })
                                  }
                                />
                              ))}
                            </div>
                          </fieldset>
                        ))}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={form.palettes.length >= 8}
                        onClick={() => {
                          const id = `palette-${crypto.randomUUID().slice(0, 8)}`;
                          change({
                            ...form,
                            palettes: [
                              ...form.palettes,
                              {
                                id,
                                label: t("storyTemplates.newPalette"),
                                colors: { ...form.theme.colors },
                              },
                            ],
                          });
                        }}
                      >
                        <Plus className="mr-2 size-4" />
                        {t("storyTemplates.addPalette")}
                      </Button>
                    </section>

                    <section className="space-y-3 border-b border-border pb-5">
                      <div>
                        <h3 className="text-sm font-semibold">{t("storyTemplates.fontOptions")}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("storyTemplates.fontHelp")}
                        </p>
                      </div>
                      {fontsQuery.isError ? (
                        <ErrorState
                          error={fontsQuery.error}
                          retry={() => void fontsQuery.refetch()}
                        />
                      ) : (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                          {(fontsQuery.data ?? form.allowedFonts).map((font) => (
                            <label key={font} className="flex min-h-9 items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={form.allowedFonts.includes(font)}
                                onChange={(event) => toggleFont(font, event.target.checked)}
                                className="size-4 accent-primary"
                              />
                              <span>{font}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="space-y-3 border-b border-border pb-5">
                      <h3 className="text-sm font-semibold">{t("storyTemplates.previewImage")}</h3>
                      <label className="grid gap-1.5 text-xs text-muted-foreground">
                        {t("storyTemplates.previewImageHelp")}
                        <Input
                          value={form.previewImageUrl ?? ""}
                          onChange={(event) =>
                            change({ ...form, previewImageUrl: event.target.value || null })
                          }
                          placeholder="/images/story-templates/ten-anh.jpg"
                          className="h-10 font-mono text-xs"
                        />
                      </label>
                    </section>

                    {error && (
                      <p
                        role="alert"
                        className="whitespace-pre-line border-l-2 border-destructive px-3 py-2 text-sm text-destructive"
                      >
                        {error}
                      </p>
                    )}
                    {message && (
                      <p
                        role="status"
                        className="border-l-2 border-primary px-3 py-2 text-sm text-primary"
                      >
                        {message}
                      </p>
                    )}
                    {dirty && selectedTemplate?.published && (
                      <p className="text-xs text-muted-foreground">
                        {t("storyTemplates.saveBeforePublish")}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pb-3">
                      <Button
                        disabled={
                          busy ||
                          !form.key.trim() ||
                          !form.name.trim() ||
                          Boolean(selectedTemplate && !dirty)
                        }
                        onClick={saveDraft}
                      >
                        {selectedTemplate
                          ? t("storyTemplates.saveDraft")
                          : t("storyTemplates.createDraft")}
                      </Button>
                      {selectedTemplate && (
                        <>
                          <Button
                            variant="outline"
                            disabled={busy || Boolean(dirty)}
                            onClick={() => setConfirmation("publish")}
                          >
                            {t("storyTemplates.publish")}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => setConfirmation("archive")}
                          >
                            {selectedTemplate.isArchived
                              ? t("storyTemplates.restore")
                              : t("storyTemplates.archive")}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <aside className="min-w-0 space-y-3 2xl:sticky 2xl:top-5 2xl:self-start">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        {t("storyTemplates.previewFor", {
                          version:
                            previewVersion === "published" && selectedTemplate?.published
                              ? t("storyTemplates.published")
                              : t("storyTemplates.draft"),
                        })}
                      </p>
                      <div
                        className="inline-flex w-fit rounded-lg border border-border bg-muted/40 p-1"
                        role="group"
                        aria-label={t("storyTemplates.previewSize")}
                      >
                        {previewViewports.map(({ id, Icon }) => (
                          <Button
                            key={id}
                            type="button"
                            size="sm"
                            variant={viewport === id ? "default" : "ghost"}
                            onClick={() => setViewport(id)}
                            aria-pressed={viewport === id}
                            className="gap-1.5 px-2.5"
                          >
                            <Icon className="size-4" />
                            <span>{t(`storyTemplates.viewports.${id}`)}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                    {previewConfig && (
                      <AdminStoryTemplatePreview
                        config={previewConfig}
                        version={currentTemplateVersion}
                        viewport={viewport}
                        onViewportChange={setViewport}
                      />
                    )}
                    {!previewConfig && (
                      <p className="border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                        {t("storyTemplates.previewNeedsName")}
                      </p>
                    )}
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t("storyTemplates.previewDataNote")}
                    </p>
                  </aside>
                </div>
              ) : selectedTemplate ? (
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {t(`storyTemplates.status.${statusOf(selectedTemplate)}`)} · v
                        {selectedTemplate.version}
                      </p>
                      <h2 className="mt-1 font-display text-2xl">{selectedTemplate.name}</h2>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPreviewVersion("published");
                        setViewport("mobile");
                      }}
                    >
                      <Eye className="mr-2 size-4" />
                      {t("storyTemplates.previewAction")}
                    </Button>
                  </div>
                  {previewConfig && (
                    <AdminStoryTemplatePreview
                      config={previewConfig}
                      version={selectedTemplate.publishedVersion || selectedTemplate.version}
                      viewport={viewport}
                      onViewportChange={setViewport}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t("storyTemplates.readOnlyDescription")}
                  </p>
                </div>
              ) : (
                <div className="grid min-h-64 place-content-center border border-dashed border-border px-6 text-center">
                  <p className="font-display text-xl">{t("storyTemplates.selectPrompt")}</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    {t("storyTemplates.selectDescription")}
                  </p>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {pendingImport && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="story-template-import-title"
            className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-background p-5 shadow-lg"
          >
            <div>
              <h2 id="story-template-import-title" className="font-display text-xl">
                {t("storyTemplates.confirmImportTitle")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("storyTemplates.confirmImport", {
                  count: pendingImport.templates.length,
                  skipped: pendingImport.existingKeys.length,
                  created: pendingImport.templates.length - pendingImport.existingKeys.length,
                })}
              </p>
            </div>
            <ul className="max-h-48 divide-y divide-border overflow-auto border-y border-border text-sm">
              {pendingImport.templates.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 py-2">
                  <span>{item.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {pendingImport.existingKeys.includes(item.key)
                      ? t("storyTemplates.importDuplicate")
                      : item.key}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs leading-5 text-muted-foreground">
              {t("storyTemplates.importPreservesExisting")}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={busy} onClick={() => setPendingImport(null)}>
                {t("storyTemplates.cancel")}
              </Button>
              <Button
                disabled={
                  busy || pendingImport.templates.length === pendingImport.existingKeys.length
                }
                onClick={() => void importTemplates()}
              >
                {busy ? t("storyTemplates.importing") : t("storyTemplates.confirmImportAction")}
              </Button>
            </div>
          </section>
        </div>
      )}

      {confirmation && selectedTemplate && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4"
          role="presentation"
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="story-template-action-title"
            className="w-full max-w-md space-y-4 rounded-xl border border-border bg-background p-5 shadow-lg"
          >
            <div>
              <h2 id="story-template-action-title" className="font-display text-xl">
                {t(
                  confirmation === "publish"
                    ? "storyTemplates.confirmPublishTitle"
                    : selectedTemplate.isArchived
                      ? "storyTemplates.confirmRestoreTitle"
                      : "storyTemplates.confirmArchiveTitle",
                )}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t(
                  confirmation === "publish"
                    ? "storyTemplates.confirmPublish"
                    : selectedTemplate.isArchived
                      ? "storyTemplates.confirmRestore"
                      : "storyTemplates.confirmArchive",
                  { name: selectedTemplate.name },
                )}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>
                {t("storyTemplates.cancel")}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  if (confirmation === "publish")
                    void action(
                      () =>
                        storyTemplateAdminApi.publish(
                          api,
                          selectedTemplate.id,
                          selectedTemplate.version,
                        ),
                      t("storyTemplates.publishedMessage"),
                    );
                  else
                    void action(
                      () =>
                        storyTemplateAdminApi.archive(
                          api,
                          selectedTemplate.id,
                          selectedTemplate.version,
                          selectedTemplate.isArchived,
                        ),
                      selectedTemplate.isArchived
                        ? t("storyTemplates.restored")
                        : t("storyTemplates.archivedMessage"),
                    );
                }}
              >
                {confirmation === "publish"
                  ? t("storyTemplates.publish")
                  : selectedTemplate.isArchived
                    ? t("storyTemplates.restore")
                    : t("storyTemplates.archive")}
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
