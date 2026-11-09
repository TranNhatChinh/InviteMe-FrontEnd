"use client";

import { AdminTemplates } from "@/features/admin";
import {
  parseStudioDocument,
  resolveInvitationDocument,
  storedInvitationDocument,
  TemplateThumbnail,
} from "@/features/template-studio";

export default function Page() {
  return (
    <AdminTemplates
      renderDesignPreview={(source) => {
        if (!source) return null;
        try {
          return (
            <TemplateThumbnail
              document={resolveInvitationDocument(parseStudioDocument(source))}
              fluid
              full
            />
          );
        } catch {
          return null;
        }
      }}
      copyDesign={(source) => JSON.stringify(storedInvitationDocument(parseStudioDocument(source)))}
    />
  );
}
