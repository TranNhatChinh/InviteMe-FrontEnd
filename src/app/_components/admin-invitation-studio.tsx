"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import {
  parseStudioDocument,
  resolveInvitationDocument,
  storedInvitationDocument,
  TemplateStudio,
} from "@/features/template-studio";
import { resolveMediaUrl } from "@/core/config/media-url";
import { Button } from "@/shared/ui/button";
import { LoadingState } from "@/shared/feedback/loading-state";
import { ErrorState } from "@/shared/feedback/error-state";
import { adminApi } from "@/features/admin";

export function AdminInvitationStudio({ id }: { id: string }) {
  const { api } = useRuntime();
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const template = useQuery({
    queryKey: ["admin-template", id],
    queryFn: ({ signal }) => adminApi.template(api, id, signal),
  });
  async function save(serialized: string) {
    if (!template.data) return;
    const item = template.data;
    await adminApi.updateTemplate(api, id, {
      name: item.name,
      slug: item.slug,
      theme: item.theme,
      previewUrl: item.previewUrl,
      configurationJson: JSON.stringify(storedInvitationDocument(parseStudioDocument(serialized))),
      status: item.status,
    });
    setMessage("Đã lưu bản thiết kế. Nhấn Xuất bản để cập nhật mẫu công khai.");
    await client.invalidateQueries({ queryKey: ["admin-template", id] });
  }
  async function publish() {
    setPublishing(true);
    setMessage("");
    try {
      await adminApi.publishTemplate(api, id);
      setMessage("Đã xuất bản mẫu thiệp.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin-template", id] }),
        client.invalidateQueries({ queryKey: ["admin-templates"] }),
        client.invalidateQueries({ queryKey: ["public-templates"] }),
      ]);
    } catch {
      setMessage("Không thể xuất bản. Hãy kiểm tra thiết kế và lưu bản nháp trước.");
    } finally {
      setPublishing(false);
    }
  }
  if (template.isPending) return <LoadingState />;
  if (template.isError || !template.data)
    return <ErrorState retry={() => void template.refetch()} />;
  let initialDocument: string | undefined;
  try {
    if (template.data.configurationJson) {
      initialDocument = JSON.stringify(
        resolveInvitationDocument(parseStudioDocument(template.data.configurationJson)),
      );
    }
  } catch {
    // A legacy draft can be replaced with a valid Studio document.
  }
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div>
          <Link href="/admin/templates" className="text-sm text-primary">
            ← Danh sách mẫu thiệp
          </Link>
          <h1 className="font-display text-2xl">{template.data.name}</h1>
          <p className="text-sm text-muted-foreground">
            Chỉnh thiết kế, lưu bản nháp rồi xuất bản.
          </p>
        </div>
        <Button
          disabled={publishing || !template.data.configurationJson}
          onClick={() => void publish()}
        >
          {publishing ? "Đang xuất bản…" : "Xuất bản"}
        </Button>
      </header>
      {message && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          {message}
        </p>
      )}
      <TemplateStudio
        key={id}
        initialDocument={initialDocument}
        backHref="/admin/templates"
        onSave={save}
        onUploadImage={async (file) => {
          const asset = await adminApi.uploadTemplateAsset(api, id, file);
          return { ...asset, src: resolveMediaUrl(asset.src) ?? asset.src };
        }}
      />
    </div>
  );
}
