"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ImageIcon, Plus } from "lucide-react";
import { resolveMediaUrl } from "@/core/config/media-url";
import { useRouter } from "next/navigation";
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
import { adminApi } from "../api/admin.api";
import { useLocale } from "@/i18n/language-context";
import { formatNumber } from "@/i18n/format";

const emptyDesign = JSON.stringify({
  schemaVersion: 1,
  nodes: {
    ROOT: {
      type: { resolvedName: "StudioFrame" },
      isCanvas: true,
      props: { width: 480, height: 1000, background: "#ffffff" },
      displayName: "StudioFrame",
      custom: {},
      hidden: false,
      nodes: [],
      linkedNodes: {},
    },
  },
});

export function AdminTemplates({
  copyDesign,
  renderDesignPreview,
}: {
  copyDesign: (source: string) => string;
  renderDesignPreview: (source: string | null) => ReactNode;
}) {
  const { t: translate } = useTranslation("admin");
  const { language } = useLocale();
  const { api } = useRuntime();
  const client = useQueryClient();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [draftFilter, setDraftFilter] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState<"copy" | "blank" | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [sourcePage, setSourcePage] = useState(1);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const templates = useQuery({
    queryKey: ["admin-templates", page, search, statusFilter, draftFilter],
    queryFn: ({ signal }) =>
      adminApi.templates(
        api,
        {
          page,
          pageSize: 20,
          search,
          status: statusFilter,
          hasUnpublishedChanges: draftFilter ? draftFilter === "changed" : undefined,
        },
        signal,
      ),
  });
  const permissions = useQuery({
    queryKey: ["admin-my-permissions"],
    queryFn: ({ signal }) => adminApi.myPermissions(api, signal),
  });
  const canManageTemplates = permissions.data?.includes("ADMIN_TEMPLATES_MANAGE") ?? false;
  const invalidate = async () => {
    setError("");
    await client.invalidateQueries({ queryKey: ["admin-templates"] });
  };
  const sources = useQuery({
    queryKey: ["admin-templates", "creation-sources", sourcePage],
    queryFn: ({ signal }) => adminApi.templates(api, { page: sourcePage, pageSize: 20 }, signal),
    enabled: open && sourceMode === "copy" && canManageTemplates,
  });
  const save = useMutation({
    mutationFn: async () => {
      let configurationJson = emptyDesign;
      if (sourceMode === "copy") {
        const source = await adminApi.template(api, sourceId);
        try {
          if (!source.configurationJson) throw new Error("Missing source design");
          configurationJson = copyDesign(source.configurationJson);
        } catch {
          throw new Error("invalidSourceTemplate");
        }
      }
      const slugBase = name
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/đ/g, "d")
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 120)
        .replace(/^-|-$/g, "");
      return adminApi.createTemplate(api, {
        name: name.trim(),
        slug: `${slugBase || "mau-thiep"}-${crypto.randomUUID().slice(0, 8)}`,
        configurationJson,
        status: "DRAFT",
      });
    },
    onSuccess: (created) => {
      setOpen(false);
      void invalidate();
      router.push(`/admin/templates/${encodeURIComponent(created.id)}/studio`);
    },
    onError: (failure) =>
      setError(
        translate(
          failure.message === "invalidSourceTemplate"
            ? "invalidSourceTemplate"
            : "saveTemplateFailed",
        ),
      ),
  });
  const changePublication = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "publish" | "hide" | "show" }) =>
      action === "publish"
        ? adminApi.publishTemplate(api, id)
        : adminApi.setTemplateStatus(api, id, action === "show" ? "ACTIVE" : "INACTIVE"),
    onSuccess: async (_, { id }) => {
      await Promise.all([
        invalidate(),
        client.invalidateQueries({ queryKey: ["admin-template", id] }),
        client.invalidateQueries({ queryKey: ["public-templates"] }),
      ]);
    },
    onError: (_, { action }) =>
      setError(
        translate(action === "publish" ? "templatePublishFailed" : "templateVisibilityFailed"),
      ),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (save.isPending || !name.trim() || !sourceMode || (sourceMode === "copy" && !sourceId))
      return;
    save.mutate();
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={translate("templateManagementTitle")}
        description={translate("templateManagementDescription")}
        action={
          canManageTemplates ? (
            <Button
              onClick={() => {
                setName("");
                setSourceMode(null);
                setSourcePage(1);
                setSourceId("");
                setError("");
                setOpen(true);
              }}
            >
              <Plus aria-hidden="true" />
              {translate("createTemplateAction")}
            </Button>
          ) : undefined
        }
      />
      {permissions.data && !canManageTemplates && (
        <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
          {translate("templatesReadOnly")}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(searchDraft.trim());
          setPage(1);
        }}
        className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end"
      >
        <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-4">
          {translate("templateSearchLabel")}
          <Input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            maxLength={100}
            placeholder={translate("templateName")}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {translate("templateVisibilityFilter")}
          <select
            className="h-10 rounded-lg border bg-background px-3"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{translate("allStatuses")}</option>
            <option value="ACTIVE">{translate("templateVisible")}</option>
            <option value="DRAFT">{translate("templateNeverPublished")}</option>
            <option value="INACTIVE">{translate("hidden")}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          {translate("templateDraftFilter")}
          <select
            className="h-10 rounded-lg border bg-background px-3"
            value={draftFilter}
            onChange={(event) => {
              setDraftFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{translate("allStatuses")}</option>
            <option value="changed">{translate("templateUnpublishedChanges")}</option>
            <option value="synced">{translate("templateDraftSynced")}</option>
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
            setDraftFilter("");
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
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              {templates.data.items.map((item) => {
                const previewUrl = resolveMediaUrl(item.previewUrl);
                const visible = item.status === "ACTIVE";
                const published = item.publishedVersion > 0;
                return (
                  <li key={item.id} className="flex items-start gap-4 p-4 sm:gap-5 sm:p-5">
                    <div className="aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-xl border bg-muted sm:w-28">
                      {previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewUrl}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        (renderDesignPreview(item.configurationJson) ?? (
                          <div className="grid size-full place-items-center text-muted-foreground">
                            <ImageIcon aria-hidden="true" className="size-6" />
                          </div>
                        ))
                      )}
                    </div>
                    <div className="min-w-0 space-y-2">
                      <div>
                        <h2 className="break-words font-semibold">{item.name}</h2>
                        <p className="break-all text-xs text-muted-foreground">{item.slug}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`rounded-full px-2.5 py-1 font-medium whitespace-nowrap ${visible ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}
                        >
                          {translate(
                            visible
                              ? "templateVisible"
                              : item.status === "INACTIVE"
                                ? "hidden"
                                : "templateNeverPublished",
                          )}
                        </span>
                        {published && item.hasUnpublishedChanges && (
                          <span className="inline-flex items-center gap-1.5 text-amber-800">
                            <span
                              className="size-2 shrink-0 rounded-full bg-amber-500"
                              aria-hidden="true"
                            />
                            {translate("templateUnpublishedChanges")}
                          </span>
                        )}
                      </div>
                      {published && (
                        <p className="text-xs text-muted-foreground">
                          {translate("templatePublishedVersion", {
                            version: formatNumber(item.publishedVersion, language),
                          })}
                        </p>
                      )}
                      {canManageTemplates && (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/admin/templates/${encodeURIComponent(item.id)}/studio`}>
                              {translate("edit")}
                            </Link>
                          </Button>
                          {item.configurationJson && (!published || item.hasUnpublishedChanges) && (
                            <Button
                              size="sm"
                              disabled={changePublication.isPending}
                              onClick={() =>
                                changePublication.mutate({ id: item.id, action: "publish" })
                              }
                            >
                              {translate("publish")}
                            </Button>
                          )}
                          {published && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={changePublication.isPending}
                              onClick={() =>
                                changePublication.mutate({
                                  id: item.id,
                                  action: visible ? "hide" : "show",
                                })
                              }
                            >
                              {translate(visible ? "hide" : "templateShow")}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
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
          if (save.isPending) return;
          setOpen(false);
          setError("");
        }}
        title={translate("addTemplate")}
        description={translate("templateCreationDescription")}
      >
        <form onSubmit={submit} className="grid gap-4">
          <fieldset disabled={save.isPending} className="grid grid-cols-2 gap-2">
            <legend className="mb-2 text-sm font-medium">
              {translate("templateStartingPoint")}
            </legend>
            {(["copy", "blank"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                variant={sourceMode === mode ? "default" : "outline"}
                className="h-auto min-h-11 whitespace-normal py-2"
                aria-pressed={sourceMode === mode}
                onClick={() => {
                  setSourceMode(mode);
                  setError("");
                }}
              >
                {translate(mode === "copy" ? "templateFromExisting" : "templateFromBlank")}
              </Button>
            ))}
          </fieldset>
          {sourceMode === "copy" && (
            <fieldset disabled={save.isPending} className="grid gap-2">
              <label className="grid gap-1 text-sm">
                {translate("sourceTemplate")}
                <select
                  required
                  className="h-10 rounded-lg border bg-background px-3"
                  value={sourceId}
                  onChange={(event) => setSourceId(event.target.value)}
                >
                  <option value="">{translate("selectSourceTemplate")}</option>
                  {sources.data?.items.map((item) => (
                    <option key={item.id} value={item.id} disabled={!item.configurationJson}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {sources.isPending && <LoadingState label={translate("loadingTemplates")} />}
              {sources.isError && (
                <ErrorState error={sources.error} retry={() => void sources.refetch()} />
              )}
              {(sourcePage > 1 || (sources.data?.totalPages ?? 0) > 1) && (
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={sourcePage <= 1}
                    onClick={() => {
                      setSourceId("");
                      setSourcePage((current) => current - 1);
                    }}
                  >
                    {translate("previous", { ns: "common" })}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={sourcePage >= (sources.data?.totalPages ?? 0)}
                    onClick={() => {
                      setSourceId("");
                      setSourcePage((current) => current + 1);
                    }}
                  >
                    {translate("next", { ns: "common" })}
                  </Button>
                </div>
              )}
            </fieldset>
          )}
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
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => setOpen(false)}
            >
              {translate("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                save.isPending ||
                !name.trim() ||
                !sourceMode ||
                (sourceMode === "copy" && !sourceId)
              }
            >
              {save.isPending ? translate("saving") : translate("saveTemplate")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
