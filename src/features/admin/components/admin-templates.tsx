"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { PageHeader } from "@/shared/components/page-header";
import { EmptyState } from "@/shared/feedback/empty-state";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { Modal } from "@/shared/ui/modal";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { adminApi, type AdminTemplate } from "../api/admin.api";
import { useLocale } from "@/i18n/language-context";
import { formatDate, formatNumber } from "@/i18n/format";

type FormValue = {
  name: string;
  slug: string;
  theme: string;
  previewUrl: string;
  configurationJson: string;
  status: "ACTIVE" | "INACTIVE" | "DRAFT";
};
const blank: FormValue = {
  name: "",
  slug: "",
  theme: "",
  previewUrl: "",
  configurationJson: "",
  status: "DRAFT",
};
function toForm(template: AdminTemplate): FormValue {
  return {
    name: template.name,
    slug: template.slug,
    theme: template.theme ?? "",
    previewUrl: template.previewUrl ?? "",
    configurationJson: template.configurationJson ?? "",
    status: template.status,
  };
}

export function AdminTemplates() {
  const { t: translate } = useTranslation("admin");
  const { language } = useLocale();
  const { api } = useRuntime();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminTemplate | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormValue>(blank);
  const [error, setError] = useState("");
  const templates = useQuery({
    queryKey: ["admin-templates", page, search, statusFilter],
    queryFn: ({ signal }) =>
      adminApi.templates(api, { page, pageSize: 20, search, status: statusFilter }, signal),
  });
  const invalidate = async () => {
    setError("");
    await client.invalidateQueries({ queryKey: ["admin-templates"] });
  };
  const save = useMutation({
    mutationFn: () => {
      const value = {
        ...form,
        theme: form.theme || null,
        previewUrl: form.previewUrl || null,
        configurationJson: form.configurationJson || null,
      };
      return editing
        ? adminApi.updateTemplate(api, editing.id, value)
        : adminApi.createTemplate(api, value);
    },
    onSuccess: async () => {
      setOpen(false);
      setEditing(null);
      await invalidate();
    },
    onError: () => setError(translate("saveTemplateFailed")),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "INACTIVE" }) =>
      status === "ACTIVE"
        ? adminApi.publishTemplate(api, id)
        : adminApi.setTemplateStatus(api, id, status),
    onSuccess: invalidate,
    onError: () => setError(translate("templateVisibilityFailed")),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (form.configurationJson.trim()) JSON.parse(form.configurationJson);
    } catch {
      setError(translate("invalidTemplateJson"));
      return;
    }
    save.mutate();
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        description="Manage the template registry. Hiding a template preserves its record and existing invitations."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setForm(blank);
              setOpen(true);
            }}
          >
            {translate("addTemplate")}
          </Button>
        }
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(searchDraft.trim());
          setPage(1);
        }}
        className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_200px_auto_auto] sm:items-end"
      >
        <label className="grid gap-1 text-sm">
          {translate("templateSearchLabel")}
          <Input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            maxLength={100}
            placeholder={translate("templateName")}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {translate("status")}
          <select
            className="h-10 rounded-lg border bg-background px-3"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{translate("allStatuses")}</option>
            <option value="ACTIVE">{translate("activeStatus")}</option>
            <option value="DRAFT">{translate("draftStatus")}</option>
            <option value="INACTIVE">{translate("hidden")}</option>
          </select>
        </label>
        <Button type="submit">{translate("search")}</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSearchDraft("");
            setSearch("");
            setStatusFilter("");
            setPage(1);
          }}
        >
          {translate("reset")}
        </Button>
      </form>
      {error && !open && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {templates.isPending && <LoadingState label={translate("loadingTemplates")} />}
      {templates.isError && (
        <ErrorState error={templates.error} retry={() => void templates.refetch()} />
      )}
      {templates.data &&
        (templates.data.items.length === 0 ? (
          <EmptyState
            title={translate("noTemplates")}
            description={translate("addOrFilterTemplates")}
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border bg-card">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    {[
                      translate("template"),
                      translate("theme"),
                      translate("status"),
                      translate("updated"),
                      translate("actions"),
                    ].map((x) => (
                      <th key={x} className="px-4 py-3 font-medium">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {templates.data.items.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-4">
                        <p className="font-medium">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.slug}</p>
                      </td>
                      <td className="px-4 py-4">{t.theme || "—"}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${t.status === "ACTIVE" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                        >
                          {translate(
                            t.status === "INACTIVE" ? "hidden" : `${t.status.toLowerCase()}Status`,
                            { defaultValue: t.status },
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {formatDate(t.updatedAt, language, { dateStyle: "medium" })}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/admin/templates/${encodeURIComponent(t.id)}/studio`}>
                              Studio
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditing(t);
                              setForm(toForm(t));
                              setOpen(true);
                            }}
                          >
                            {translate("edit")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={setStatus.isPending}
                            onClick={() =>
                              setStatus.mutate({
                                id: t.id,
                                status: t.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                              })
                            }
                          >
                            {t.status === "ACTIVE" ? translate("hide") : translate("publish")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {translate("templateCount", {
                  count: formatNumber(templates.data.totalCount, language),
                  page: formatNumber(templates.data.page, language),
                })}
                {Math.max(templates.data.totalPages, 1)}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1 || templates.isFetching}
                  onClick={() => setPage((x) => x - 1)}
                >
                  {translate("previous", { ns: "common" })}
                </Button>
                <Button
                  variant="outline"
                  disabled={page >= templates.data.totalPages || templates.isFetching}
                  onClick={() => setPage((x) => x + 1)}
                >
                  {translate("next", { ns: "common" })}
                </Button>
              </div>
            </div>
          </>
        ))}
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setError("");
        }}
        title={editing ? translate("editTemplate") : translate("addTemplate")}
        description={translate("templateMetadataDescription")}
      >
        <form onSubmit={submit} className="grid gap-4">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <label className="grid gap-1 text-sm">
            {translate("name")}
            <Input
              required
              maxLength={150}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm">
            {translate("slug")}
            <Input
              required
              maxLength={160}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={form.slug}
              onChange={(e) =>
                setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })
              }
              placeholder="elegant-garden"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              {translate("theme")}
              <Input
                maxLength={100}
                value={form.theme}
                onChange={(e) => setForm({ ...form, theme: e.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              {translate("previewUrl")}
              <Input
                maxLength={2048}
                value={form.previewUrl}
                onChange={(e) => setForm({ ...form, previewUrl: e.target.value })}
                placeholder="/images/templates/preview.webp"
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            {translate("status")}
            <select
              className="h-10 rounded-lg border bg-background px-3"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as FormValue["status"] })}
            >
              <option value="DRAFT">{translate("draftStatus")}</option>
              <option value="ACTIVE">{translate("activeStatus")}</option>
              <option value="INACTIVE">{translate("hidden")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            {translate("designConfig")}
            <textarea
              className="min-h-36 rounded-lg border bg-background p-3 font-mono text-xs"
              value={form.configurationJson}
              onChange={(e) => setForm({ ...form, configurationJson: e.target.value })}
              placeholder="{ }"
            />
            <span className="text-xs leading-5 text-muted-foreground">
              {translate("designConfigHelp")}
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {translate("cancel")}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? translate("saving") : translate("saveTemplate")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
