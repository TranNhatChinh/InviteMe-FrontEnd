"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import {
  parseStudioDocument,
  resolveInvitationDocument,
  storedInvitationDocument,
  TemplateStudio,
  TemplateThumbnail,
} from "@/features/template-studio";
import { resolveMediaUrl } from "@/core/config/media-url";
import { Input } from "@/shared/ui/input";
import { LoadingState } from "@/shared/feedback/loading-state";
import { ErrorState } from "@/shared/feedback/error-state";
import { useCurrentUser } from "@/features/auth";
import { adminApi } from "@/features/admin";

export function AdminInvitationStudio({ id }: { id: string }) {
  const { api } = useRuntime();
  const { user } = useCurrentUser();
  const { t } = useTranslation("ui");
  const { t: adminText } = useTranslation("admin");
  const client = useQueryClient();
  const [draftName, setDraftName] = useState<string>();
  const template = useQuery({
    queryKey: ["admin-template", id],
    queryFn: ({ signal }) => adminApi.template(api, id, signal),
  });
  async function save(serialized: string) {
    if (!template.data) return;
    const item = template.data;
    const name = (draftName ?? item.name).trim();
    if (!name) throw new Error("A template name is required.");
    const saved = await adminApi.updateTemplate(api, id, {
      name,
      slug: item.slug,
      theme: item.theme,
      previewUrl: item.previewUrl,
      configurationJson: JSON.stringify(storedInvitationDocument(parseStudioDocument(serialized))),
      status: item.status,
    });
    client.setQueryData(["admin-template", id], saved);
    setDraftName((current) => (current === draftName ? undefined : current));
    await client.invalidateQueries({ queryKey: ["admin-templates"] });
  }
  async function publish(serialized: string) {
    await save(serialized);
    try {
      await adminApi.publishTemplate(api, id);
    } catch {
      throw new Error(t("invitationStudio.draftSavedPublishFailed"));
    }
    await Promise.all([
      client.invalidateQueries({ queryKey: ["admin-template", id] }),
      client.invalidateQueries({ queryKey: ["admin-templates"] }),
      client.invalidateQueries({ queryKey: ["public-templates"] }),
    ]);
  }
  if (template.isPending) return <LoadingState />;
  if (template.isError || !template.data)
    return <ErrorState retry={() => void template.refetch()} />;
  let document: ReturnType<typeof resolveInvitationDocument> | undefined;
  try {
    if (template.data.configurationJson) {
      document = resolveInvitationDocument(parseStudioDocument(template.data.configurationJson));
    }
  } catch {
    // A legacy draft can be replaced with a valid Studio document.
  }
  const item = template.data;
  const previewUrl = resolveMediaUrl(item.previewUrl);
  const name = draftName ?? item.name;
  return (
    <TemplateStudio
      key={id}
      initialDocument={document && JSON.stringify(document)}
      backHref="/admin/templates"
      backup={user ? { scope: `admin:${user.id}:${id}`, title: name } : undefined}
      adminLayout={{
        backLabel: t("invitationStudio.back"),
        status: "",
        settings: (
          <>
            <div className="overflow-hidden rounded-xl border">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="aspect-video w-full object-cover" />
              ) : document ? (
                <div className="aspect-video overflow-hidden">
                  <TemplateThumbnail document={document} fluid full />
                </div>
              ) : null}
              <div className="space-y-2 p-3">
                <label>
                  {adminText("templateName")}
                  <Input
                    required
                    maxLength={150}
                    value={name}
                    aria-invalid={!name.trim()}
                    onChange={(event) => setDraftName(event.target.value)}
                  />
                </label>
                <span className="inline-block rounded-full bg-muted px-2.5 py-1 text-xs">
                  {adminText(
                    item.status === "INACTIVE" ? "hidden" : `${item.status.toLowerCase()}Status`,
                  )}
                </span>
              </div>
            </div>
          </>
        ),
      }}
      onSave={save}
      onPublish={publish}
      onUploadImage={async (file) => {
        const asset = await adminApi.uploadTemplateAsset(api, id, file);
        return { ...asset, src: resolveMediaUrl(asset.src) ?? asset.src };
      }}
    />
  );
}
