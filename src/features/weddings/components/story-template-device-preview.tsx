"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StoryBuilderV4Renderer } from "./story-builder-v4-renderer";
import type { StoryBuilderV4Document } from "../schemas/story-builder-v4.schema";

type PreviewViewport = "desktop" | "tablet" | "mobile";

const viewportSizes = {
  desktop: { width: 1100, height: 720 },
  tablet: { width: 768, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

export function StoryTemplateDevicePreview({
  document: websiteDocument,
  viewport,
  url,
  height = 460,
  fallback,
}: {
  document: StoryBuilderV4Document | null;
  viewport: PreviewViewport;
  url: string;
  height?: number | string;
  fallback?: ReactNode;
}) {
  const { t } = useTranslation("ui");
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const dimensions = viewportSizes[viewport];

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const handleLoad = () => {
      setPortalTarget(frame.contentDocument?.getElementById("inviteme-template-preview-root") ?? null);
    };

    const stylesheetMarkup = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
      .map((stylesheet) => `<link rel="stylesheet" href="${stylesheet.href.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">`)
      .join("");
    const inlineStyleMarkup = Array.from(document.querySelectorAll<HTMLStyleElement>("style"))
      .map((style) => style.outerHTML)
      .join("");

    frame.addEventListener("load", handleLoad);
    frame.srcdoc = `<!doctype html><html lang="${document.documentElement.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${stylesheetMarkup}${inlineStyleMarkup}<style>html,body,#inviteme-template-preview-root{margin:0;min-height:100%;}html,body{width:100%;}body{overflow-x:hidden;}</style></head><body><div id="inviteme-template-preview-root"></div></body></html>`;
    return () => {
      frame.removeEventListener("load", handleLoad);
      setPortalTarget(null);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => setStageSize({ width: stage.clientWidth - 32, height: stage.clientHeight - 32 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [height, viewport]);

  const scale = stageSize.width > 0 && stageSize.height > 0
    ? Math.max(0.2, Math.min(1, stageSize.width / dimensions.width, stageSize.height / dimensions.height))
    : 1;
  const screenWidth = dimensions.width * scale;
  const screenHeight = dimensions.height * scale;

  return (
    <div
      ref={stageRef}
      className="flex w-full items-start justify-center overflow-hidden rounded-xl bg-[#f3eeec] p-4"
      style={{ height }}
    >
      <div className="relative shrink-0" style={{ width: screenWidth, height: screenHeight }}>
        <div
          className={`absolute left-0 top-0 overflow-hidden bg-background shadow-xl ${
            viewport === "desktop"
              ? "rounded-lg border border-border"
              : viewport === "tablet"
                ? "rounded-[1.5rem] border-[5px] border-[#43383a] p-1"
                : "rounded-[2.25rem] border-[6px] border-[#332a2c] p-1"
          }`}
          style={{
            width: dimensions.width,
            height: dimensions.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[inherit] bg-background">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-white px-3 text-[11px] text-muted-foreground">
              {viewport === "desktop" && <span className="flex shrink-0 gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-[#e7aaa9]" />
                <span className="size-2.5 rounded-full bg-[#e9d8b6]" />
                <span className="size-2.5 rounded-full bg-[#bdd0bb]" />
              </span>}
              {viewport !== "desktop" && <span className="h-1 w-10 shrink-0 rounded-full bg-[#ddd5d3]" aria-hidden="true" />}
              <div className="min-w-0 flex-1 truncate rounded-full border border-border bg-[#faf8f7] px-3 py-1 text-center">
                {url}
              </div>
              <span className="shrink-0 font-mono text-[10px]">{dimensions.width} × {dimensions.height}</span>
            </div>
            <div
              className="min-h-0 flex-1 overflow-auto overscroll-contain bg-background"
              aria-label={t("storyTemplates.previewTitle")}
            >
              <iframe
                ref={frameRef}
                title={t("storyTemplates.previewTitle")}
                sandbox="allow-same-origin"
                className="block size-full border-0 bg-white"
                style={{ width: dimensions.width, height: dimensions.height - 40 }}
              />
              {portalTarget && (websiteDocument
                ? createPortal(<StoryBuilderV4Renderer document={websiteDocument} />, portalTarget)
                : fallback && createPortal(fallback, portalTarget))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
