"use client";
import { ApiError } from "@/core/api/api-error";
import { GiftSettingsPanel, GiftPreviewPanel } from "@/features/gifts";
import { AuthGuard, useCurrentUser } from "@/features/auth";
import { WeddingAccessProvider } from "@/features/weddings";
import { InvitationWording } from "@/features/guests";
import {
  TemplateStudio,
  ImportedStudio,
  getInvitationDesign,
  saveInvitationDesign,
  publishInvitationDesign,
} from "@/features/template-studio";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { SessionLoading } from "@/shared/feedback/session-loading";
import { ErrorState } from "@/shared/feedback/error-state";
import { usePermission } from "@/shared/components/permission-guard";
import { PermissionGuard } from "@/shared/components/permission-guard";
import { EmptyState } from "@/shared/feedback/empty-state";
import { listWeddingMedia, mediaUrl, uploadWeddingMedia } from "@/features/weddings";
import { useTranslation } from "react-i18next";

// Compose the guest management panel and design editor here to preserve feature boundaries.
export function WeddingTemplateStudio({
  weddingId,
  template,
  preview = false,
  wording = false,
  imported = false,
}: {
  weddingId: string;
  template?: string;
  preview?: boolean;
  wording?: boolean;
  imported?: boolean;
}) {
  const { t } = useTranslation("screens");
  return (
    <AuthGuard>
      <WeddingAccessProvider weddingId={weddingId}>
        <PermissionGuard
          permission="WEDDING_EDIT"
          fallback={
            <EmptyState
              title={t("studioAccessDenied")}
              description={t("studioAccessDescription")}
            />
          }
        >
          <ConnectedStudio
            weddingId={weddingId}
            importMode={imported}
            initialTemplate={template ?? false}
            initialPreview={preview}
            initialWording={wording}
            backHref={`/weddings/${encodeURIComponent(weddingId)}/invitations`}
            wordingPanel={({ onPreview }) => (
              <PermissionGuard
                permission="INVITATION_SEND"
                fallback={<p>{t("invitationPermissionRequired")}</p>}
              >
                <InvitationWording weddingId={weddingId} compact onPreview={onPreview} />
              </PermissionGuard>
            )}
          />
        </PermissionGuard>
      </WeddingAccessProvider>
    </AuthGuard>
  );
}

function ConnectedStudio({
  weddingId,
  ...props
}: { weddingId: string } & React.ComponentProps<typeof TemplateStudio>) {
  const { api } = useRuntime();
  const key = ["invitation-design", weddingId];
  const design = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getInvitationDesign(api, weddingId, signal),
  });
  if (design.isPending) return <SessionLoading />;
  if (design.isError)
    return <ErrorState error={design.error} retry={() => void design.refetch()} />;
  return <StudioSession key={weddingId} weddingId={weddingId} snapshot={design.data} {...props} />;
}

function StudioSession({
  weddingId,
  snapshot,
  ...props
}: {
  weddingId: string;
  snapshot: Awaited<ReturnType<typeof getInvitationDesign>>;
} & React.ComponentProps<typeof TemplateStudio>) {
  const { t } = useTranslation("screens");
  const { api } = useRuntime();
  const { can, isOwner } = usePermission();
  const { user } = useCurrentUser();
  const cache = useQueryClient();
  const [version, setVersion] = useState(snapshot.version);
  const [initial, setInitial] = useState(
    !props.initialTemplate &&
      snapshot.document &&
      (!props.importMode || snapshot.document.kind === "IMPORTED")
      ? JSON.stringify(snapshot.document)
      : undefined,
  );
  const [generation, setGeneration] = useState(0);
  const remoteChanged = version !== snapshot.version;
  const designKey = ["invitation-design", weddingId];
  function acceptDesign(design: typeof snapshot) {
    setVersion(design.version);
    cache.setQueryData(designKey, design);
  }

  async function saveDraft(serialized: string) {
    let saved;
    try {
      saved = await saveInvitationDesign(api, weddingId, version, serialized);
    } catch (error) {
      if (error instanceof ApiError && error.backendCode === "INVITATION_GIFT_ACCOUNT_NOT_LINKED")
        throw new Error(
          "Hộp quà mừng: tài khoản đã chọn chưa liên kết hoặc không còn khả dụng. Liên kết ngân hàng hoặc chọn QR có sẵn rồi thử lại.",
        );
      if (
        error instanceof ApiError &&
        error.backendCode === "INVITATION_GIFT_CONFIGURATION_REQUIRED"
      )
        throw new Error(
          "Hộp quà mừng chưa được cấu hình. Thêm ít nhất một mã QR hoặc ẩn widget trước khi lưu hoặc xuất bản.",
        );
      throw error;
    }
    acceptDesign(saved);
    return saved;
  }

  async function publishDesign(serialized: string) {
    const saved = await saveDraft(serialized);
    const published = await publishInvitationDesign(
      api,
      weddingId,
      saved.version,
      saved.wordingVersion,
    );
    acceptDesign(published);
  }

  const Studio =
    props.importMode || (initial && JSON.parse(initial).kind === "IMPORTED")
      ? ImportedStudio
      : TemplateStudio;
  return (
    <>
      {remoteChanged && (
        <div
          role="alert"
          className="fixed left-1/2 top-20 z-[100] w-[min(90vw,650px)] -translate-x-1/2 rounded-xl border border-amber-500 bg-amber-50 p-4 text-sm text-amber-950 shadow-lg"
        >
          {t("studioConflict")}
          <button
            className="ml-2 underline"
            onClick={() => {
              setVersion(snapshot.version);
              setInitial(snapshot.document ? JSON.stringify(snapshot.document) : undefined);
              setGeneration((value) => value + 1);
            }}
          >
            {t("studioReloadDiscard")}
          </button>
        </div>
      )}
      <Studio
        weddingId={weddingId}
        giftPreview={(settings) => <GiftPreviewPanel settings={settings} weddingId={weddingId} />}
        giftPanel={({ value, onChange }) => (
          <GiftSettingsPanel value={value} onChange={onChange} weddingId={weddingId} />
        )}
        key={generation}
        {...props}
        resolvedMusic={snapshot.music}
        onUploadImage={async (file) => {
          const media = await uploadWeddingMedia(api, weddingId, file);
          return { src: mediaUrl(media.url) ?? media.url, name: file.name };
        }}
        loadImages={async () =>
          (await listWeddingMedia(api, weddingId)).map((media) => ({
            src: mediaUrl(media.url) ?? media.url,
            name: t("uploadedPhoto", { id: media.id.slice(0, 8) }),
          }))
        }
        initialDocument={initial}
        backup={user ? { scope: `wedding:${user.id}:${weddingId}` } : undefined}
        onSave={
          can("INVITATION_SEND")
            ? async (serialized) => {
                await saveDraft(serialized);
              }
            : undefined
        }
        onPublish={isOwner ? publishDesign : undefined}
      />
    </>
  );
}
