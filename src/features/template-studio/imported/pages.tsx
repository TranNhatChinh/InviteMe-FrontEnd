"use client";
import Image from "next/image";
import type { ImportedPage, ImportedWidget } from "../schemas/document";
import { ImportedWidgetOverlay } from "./widget-overlay";

export function ImportedPages({
  pages,
  bounded = true,
  widgets = [],
  editable = false,
  selectedId,
  onSelectWidget,
  onWidgetChange,
  token,
}: {
  pages: ImportedPage[];
  bounded?: boolean;
  widgets?: ImportedWidget[];
  editable?: boolean;
  selectedId?: string | null;
  onSelectWidget?: (id: string) => void;
  onWidgetChange?: (widget: ImportedWidget) => void;
  token?: string;
}) {
  return (
    <div className={`mx-auto w-full ${bounded ? "max-w-[600px]" : ""}`} data-imported-pages>
      {pages.map((page) => (
        <div
          key={page.id}
          data-page-id={page.id}
          className="relative w-full"
          style={{ aspectRatio: `${page.width} / ${page.height}`, containerType: "inline-size" }}
        >
          <Image
            src={page.imageUrl}
            alt={`Trang thiệp ${page.order + 1}`}
            fill
            unoptimized
            sizes="(max-width: 600px) 100vw, 600px"
            className="object-contain"
          />
          <ImportedWidgetOverlay
            widgets={widgets.filter((widget) => widget.pageId === page.id)}
            editable={editable}
            selectedId={selectedId}
            onSelect={onSelectWidget}
            onChange={onWidgetChange}
            guestToken={token}
          />
        </div>
      ))}
    </div>
  );
}
