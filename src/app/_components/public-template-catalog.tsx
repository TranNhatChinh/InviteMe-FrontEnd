"use client";

import { TemplateCatalog } from "@/features/public";
import {
  parseStudioDocument,
  resolveInvitationDocument,
  TemplateThumbnail,
} from "@/features/template-studio";

export function PublicTemplateCatalog({ category }: { category?: "invite" | "story" }) {
  return (
    <TemplateCatalog
      category={category}
      renderPreview={(configurationJson) => {
        try {
          return (
            <TemplateThumbnail
              document={resolveInvitationDocument(parseStudioDocument(configurationJson))}
              fluid
            />
          );
        } catch {
          return <div className="size-full bg-primary/10" />;
        }
      }}
    />
  );
}
