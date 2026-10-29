"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { adminStoryTemplateSchema, storyTemplateAdminApi, type AdminStoryTemplate, type StoryTemplateConfig } from "../api/admin.api";

const variants: Record<string, string[]> = {
  hero: ["floral", "dark"], couple: ["alternating", "two-columns"],
  countdown: ["classic", "banner"], loveStory: ["timeline", "editorial"],
  events: ["cards"], gallery: ["grid"], rsvp: ["default"],
  wishes: ["default"], gift: ["default"],
};
const initial: StoryTemplateConfig = {
  key: "", name: "", sections: [
    { type: "hero", variant: "floral" }, { type: "couple", variant: "alternating" },
    { type: "countdown", variant: "classic" }, { type: "loveStory", variant: "timeline" },
    { type: "events", variant: "cards" }, { type: "gallery", variant: "grid" },
    { type: "rsvp", variant: "default" },
  ],
  theme: { colors: { primary: "#F4DADC", background: "#FFFAF5", accent: "#805459", text: "#3A2A2C" },
    fontHeading: "Georgia", fontBody: "Georgia" },
  palettes: [{ id: "default", label: "Mặc định", colors: {
    primary: "#F4DADC", background: "#FFFAF5", accent: "#805459", text: "#3A2A2C" } }],
  allowedFonts: ["Georgia"],
};

export function AdminStoryTemplates() {
  const { api } = useRuntime();
  const { t } = useTranslation("ui");
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ["admin-story-templates"], queryFn: () => storyTemplateAdminApi.list(api) });
  const [selected, setSelected] = useState<AdminStoryTemplate | null>(null);
  const [form, setForm] = useState<StoryTemplateConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dirty = selected && form && JSON.stringify(form) !== JSON.stringify(selected.draft);
  const refresh = async () => { await cache.invalidateQueries({ queryKey: ["admin-story-templates"] }); };
  const edit = (row: AdminStoryTemplate | null) => {
    setSelected(row); setForm(structuredClone(row?.draft ?? initial)); setError(""); setMessage("");
  };
  const change = (next: StoryTemplateConfig) => setForm(next);
  const moveSection = (draft: StoryTemplateConfig, from: number, to: number) => {
    const sections = [...draft.sections];
    const moved = sections[from];
    if (!moved || to < 1 || to >= sections.length) return;
    sections.splice(from, 1); sections.splice(to, 0, moved);
    change({ ...draft, sections });
  };
  const action = async (run: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = adminStoryTemplateSchema.parse(await run());
      setSelected(result); setForm(structuredClone(result.draft));
      setMessage(success); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("storyTemplates.actionFailed")); }
    finally { setBusy(false); }
  };
  const save = () => {
    if (!form) return;
    const draft = { ...form, key: form.key.trim(), name: form.name.trim() };
    void action(() => selected
      ? storyTemplateAdminApi.save(api, selected.id, selected.version, draft)
      : storyTemplateAdminApi.create(api, draft.key, draft), t("storyTemplates.draftSaved"));
  };
  return <div className="space-y-6">
    <PageHeader title={t("storyTemplates.title")} description={t("storyTemplates.description")}
      action={<Button onClick={() => edit(null)}>{t("storyTemplates.create")}</Button>} />
    {query.isPending && <LoadingState label={t("storyTemplates.loading")} />}
    {query.isError && <ErrorState error={query.error} retry={() => void query.refetch()} />}
    {query.data && <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="space-y-2 rounded-2xl border bg-card p-3">
        {query.data.map(row => <button key={row.id} type="button" onClick={() => edit(row)}
          className={`w-full rounded-xl border p-3 text-left ${selected?.id === row.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
          <span className="block font-medium">{row.name}</span>
          <span className="text-xs text-muted-foreground">{row.key} · v{row.version} · {t(`storyTemplates.status.${row.isArchived ? "archived" : row.published ? "published" : "draft"}`)}</span>
        </button>)}
        {query.data.length === 0 && <p className="p-3 text-sm text-muted-foreground">{t("storyTemplates.empty")}</p>}
      </div>
      {form ? <div className="space-y-5 rounded-2xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">{t("storyTemplates.keyLabel")}
            <Input value={form.key} disabled={!!selected} onChange={e => change({ ...form, key: e.target.value.toLowerCase() })} />
          </label>
          <label className="grid gap-1 text-sm">{t("storyTemplates.nameLabel")}
            <Input value={form.name} onChange={e => change({ ...form, name: e.target.value })} />
          </label>
        </div>
        <section className="space-y-3"><h2 className="font-semibold">{t("storyTemplates.sectionsTitle")}</h2>
          {form.sections.map((section, index) => <div key={section.type} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
            <span className="min-w-24 font-medium">{section.type}</span>
            <select className="h-9 rounded-lg border bg-background px-2" value={section.variant}
              onChange={e => change({ ...form, sections: form.sections.map((x, i) => i === index ? { ...x, variant: e.target.value } : x) })}>
              {variants[section.type]?.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={index <= 1} onClick={() => {
              moveSection(form, index, index - 1);
            }}>↑</Button>
            <Button size="sm" variant="outline" disabled={index === form.sections.length - 1 || index === 0} onClick={() => {
              moveSection(form, index, index + 1);
            }}>↓</Button>
            <Button size="sm" variant="outline" disabled={section.type === "hero" || section.type === "rsvp"}
              onClick={() => change({ ...form, sections: form.sections.filter((_, i) => i !== index) })}>{t("storyTemplates.hide")}</Button>
          </div>)}
          <select className="h-10 rounded-lg border bg-background px-3" value="" onChange={e => {
            const type = e.target.value; const variant = variants[type]?.[0];
            if (type && variant) change({ ...form, sections: [...form.sections, { type, variant }] });
          }}><option value="">{t("storyTemplates.addSection")}</option>
            {Object.keys(variants).filter(type => !form.sections.some(section => section.type === type)).map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </section>
        <section className="space-y-3"><h2 className="font-semibold">{t("storyTemplates.themeTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(["primary", "background", "accent", "text"] as const).map(key => <label key={key} className="grid gap-1 text-sm">{key}
              <Input value={form.theme.colors[key]} onChange={e => change({ ...form, theme: { ...form.theme,
                colors: { ...form.theme.colors, [key]: e.target.value } } })} placeholder="#123456" />
            </label>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">{(["fontHeading", "fontBody"] as const).map(key => <label key={key} className="grid gap-1 text-sm">{key}
            <select className="h-10 rounded-lg border bg-background px-3" value={form.theme[key]}
              onChange={e => change({ ...form, theme: { ...form.theme, [key]: e.target.value } })}>
              {form.allowedFonts.map(font => <option key={font} value={font}>{font}</option>)}
            </select></label>)}</div>
        </section>
        <section className="space-y-2"><h2 className="font-semibold">{t("storyTemplates.palettesTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("storyTemplates.palettesHelp")}</p>
          <textarea className="min-h-36 w-full rounded-lg border bg-background p-3 font-mono text-xs"
            key={`${selected?.id ?? "new"}-${form.key}-palettes`}
            defaultValue={JSON.stringify({ palettes: form.palettes, allowedFonts: form.allowedFonts, assets: form.assets }, null, 2)}
            onBlur={e => { try { const parsed = JSON.parse(e.target.value) as Partial<StoryTemplateConfig>;
              if (!Array.isArray(parsed.palettes) || !Array.isArray(parsed.allowedFonts)) throw new Error();
              change({ ...form, palettes: parsed.palettes, allowedFonts: parsed.allowedFonts, assets: parsed.assets }); setError("");
            } catch { setError(t("storyTemplates.invalidJson")); } }} />
        </section>
        {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="rounded-lg border border-primary/30 p-3 text-sm text-primary">{message}</p>}
        <div className="flex flex-wrap gap-2"><Button disabled={busy || !form.key || !form.name || !!error} onClick={save}>{t("storyTemplates.saveDraft")}</Button>
          {selected && <><Button variant="outline" disabled={busy || !!dirty} onClick={() => void action(
            () => storyTemplateAdminApi.publish(api, selected.id, selected.version), t("storyTemplates.publishedMessage"))}>{t("storyTemplates.publish")}</Button>
            <Button variant="outline" disabled={busy} onClick={() => void action(
              () => storyTemplateAdminApi.archive(api, selected.id, selected.version, !selected.isArchived),
              selected.isArchived ? t("storyTemplates.restored") : t("storyTemplates.archivedMessage"))}>{selected.isArchived ? t("storyTemplates.restore") : t("storyTemplates.archive")}</Button></>}
        </div>
        {dirty && <p className="text-xs text-muted-foreground">{t("storyTemplates.saveBeforePublish")}</p>}
      </div> : <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">{t("storyTemplates.selectPrompt")}</div>}
    </div>}
  </div>;
}
