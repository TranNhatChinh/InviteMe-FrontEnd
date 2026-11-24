import type { ReactNode } from "react";
import type { templateCatalog } from "../templates/catalog";

export type StudioWordingPanel = (controls: {
  onPreview: (content: string | null, recipientLabel?: string | null) => void;
}) => ReactNode;

export type TemplateStudioProps = {
  weddingId?: string;
  giftPanel?: (controls: {
    value?: import("@/shared/api/invitation-gift-settings").GiftSettings;
    onChange: (gift: import("@/shared/api/invitation-gift-settings").GiftSettings) => void;
  }) => ReactNode;
  giftPreview?: (gift?: import("@/shared/api/invitation-gift-settings").GiftSettings) => ReactNode;
  importMode?: boolean;
  resolvedMusic?: import("@/shared/api/music.api").InvitationMusic | null;
  musicLibraryLookup?: boolean;
  initialTemplate?: boolean | string;
  initialPreview?: boolean;
  initialWording?: boolean;
  wordingPanel?: StudioWordingPanel;
  backHref?: string;
  backup?: { scope: string; title?: string };
  adminLayout?: {
    backLabel: string;
    status: string;
    toolbarAction: ReactNode;
    settings: ReactNode;
  };
  initialDocument?: string;
  availableTemplates?: Array<(typeof templateCatalog)[number]>;
  onSave?: (serialized: string) => Promise<void>;
  onPublish?: (serialized: string) => Promise<void>;
  onUploadImage?: (file: File) => Promise<{ src: string; name: string }>;
  loadImages?: () => Promise<{ src: string; name: string }[]>;
};
