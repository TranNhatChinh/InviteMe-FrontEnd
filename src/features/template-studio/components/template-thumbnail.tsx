"use client";
import { useEffect, useRef, useState, useContext } from "react";
import type { parseStudioDocument } from "../schemas/document";
import { imageShapeStyle, itemStyle, studioTextStyle } from "./items";
import { resolveStudioText } from "./wording-text";
import { WordingPreviewContext } from "./wording-preview";
export function TemplateThumbnail({
  document,
  scale = 0.43,
  height = 230,
  fluid = false,
  full = false,
}: {
  document: ReturnType<typeof parseStudioDocument>;
  scale?: number;
  height?: number;
  fluid?: boolean;
  full?: boolean;
}) {
  const wording = useContext(WordingPreviewContext);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(240);
  useEffect(() => {
    if (!fluid || !host.current) return;
    const observer = new ResizeObserver((entries) => {
      const value = entries[0]?.contentRect.width;
      if (value) setWidth(value);
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [fluid]);
  const root = document.nodes.ROOT;
  if (!root) return null;
  const frameWidth = full ? (root.props.width ?? 480) : 480;
  const frameHeight = full ? (root.props.height ?? 760) : fluid ? 1400 : 700;
  const effectiveScale = fluid ? width / frameWidth : scale;
  return (
    <div
      ref={host}
      className={fluid ? "invite-thumbnail" : undefined}
      aria-hidden="true"
      style={{
        height: fluid ? undefined : height,
        aspectRatio: full ? frameWidth / frameHeight : fluid ? "9 / 16" : undefined,
        width: fluid ? "100%" : 480 * scale,
        maxWidth: "100%",
        marginInline: "auto",
        overflow: "hidden",
        position: "relative",
        background: root.props.background,
        backgroundImage: root.props.src ? `url(${root.props.src})` : undefined,
        backgroundSize: "100% auto",
        marginBottom: fluid ? 0 : 12,
      }}
    >
      <div
        style={{
          width: frameWidth,
          height: frameHeight,
          position: "relative",
          transform: `scale(${effectiveScale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      >
        {root.nodes.map((id) => {
          const node = document.nodes[id];
          if (!node) return null;
          const p = node.props;
          if (!full && (p.y ?? 0) > (fluid ? 1300 : 650)) return null;
          return node.type.resolvedName === "StudioText" ? (
            <div key={id} style={{ ...itemStyle(p, false), ...studioTextStyle(p) }}>
              {resolveStudioText(p, wording)}
            </div>
          ) : node.type.resolvedName === "StudioImage" ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={id}
              alt=""
              src={p.src}
              style={{
                ...itemStyle({ width: 370, height: 420, ...p }, false),
                ...imageShapeStyle(p),
                objectFit: p.objectFit ?? "cover",
                opacity: p.opacity,
                margin: 0,
                border: 0,
              }}
            />
          ) : null;
        })}
      </div>
    </div>
  );
}
