import type { ReactNode } from "react";
import type { templateCatalog } from "../templates/catalog";

export type StudioWordingPanel = (controls: {
  onPreview: (content: string | null) => void;
}) => ReactNode;

export type TemplateStudioProps = {
  initialTemplate?: boolean | string;
  initialPreview?: boolean;
  initialWording?: boolean;
  wordingPanel?: StudioWordingPanel;
  backHref?: string;
  initialDocument?: string;
  availableTemplates?: Array<(typeof templateCatalog)[number]>;
  onSave?: (serialized: string) => Promise<void>;
  onUploadImage?: (file: File) => Promise<{ src: string; name: string }>;
  loadImages?: () => Promise<{ src: string; name: string }[]>;
};
