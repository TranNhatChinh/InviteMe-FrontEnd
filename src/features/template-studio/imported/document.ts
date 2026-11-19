import type { z } from "zod";
import { studioDocumentSchema, type ImportedPage, type ImportedWidget } from "../schemas/document";

export type InvitationDocument = z.infer<typeof studioDocumentSchema>;
export function importedDocument(pages: ImportedPage[]): InvitationDocument {
  return {
    schemaVersion: 1,
    kind: "IMPORTED",
    pages,
    nodes: {
      ROOT: {
        type: { resolvedName: "StudioFrame" },
        isCanvas: true,
        props: {},
        displayName: "Imported invitation",
        custom: {},
        hidden: false,
        nodes: [],
        linkedNodes: {},
      },
    },
  };
}

export function orderPages(pages: ImportedPage[]): ImportedPage[] {
  return pages.map((page, order) => ({ ...page, order }));
}

export function moveWidget(widget: ImportedWidget, x: number, y: number): ImportedWidget {
  return {
    ...widget,
    x: Math.max(0, Math.min(1 - widget.width, x)),
    y: Math.max(0, Math.min(1 - widget.height, y)),
  };
}
