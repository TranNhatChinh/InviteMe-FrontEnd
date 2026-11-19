import type { ReactNode } from "react";
import type { templateCatalog } from "../templates/catalog";

export type StudioWordingPanel = (controls: {
  onPreview: (content: string | null) => void;
}) => ReactNode;

export type TemplateStudioProps = {
  resolvedMusic?: import("@/shared/api/music.api").InvitationMusic | null;
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
