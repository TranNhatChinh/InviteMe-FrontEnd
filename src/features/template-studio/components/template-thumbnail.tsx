"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { parseStudioDocument } from "../schemas/document";
import { imageShapeStyle } from "./items";
import { resolveStudioText } from "./wording-text";
export function TemplateThumbnail({
  document,
  scale = 0.43,
  height = 230,
  fluid = false,
}: {
  document: ReturnType<typeof parseStudioDocument>;
  scale?: number;
  height?: number;
  fluid?: boolean;
}) {
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
  const effectiveScale = fluid ? width / 480 : scale;
  const root = document.nodes.ROOT;
  if (!root) return null;
  return (
    <div
      ref={host}
      className={fluid ? "invite-thumbnail" : undefined}
      aria-hidden="true"
      style={{
        height: fluid ? undefined : height,
        aspectRatio: fluid ? "9 / 16" : undefined,
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
          width: 480,
          height: fluid ? 1400 : 700,
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
          if ((p.y ?? 0) > (fluid ? 1300 : 650)) return null;
          const style: CSSProperties = {
            position: "absolute",
            left: p.x,
            top: p.y,
            width: p.width,
            height: p.height,
            transform: `rotate(${p.rotation ?? 0}deg)`,
            color: p.color,
            background: p.background,
            fontSize: p.fontSize,
            fontFamily: p.fontFamily,
            textAlign: p.textAlign,
            fontStyle: p.italic ? "italic" : undefined,
            whiteSpace: "pre-wrap",
            opacity: p.opacity,
            ...imageShapeStyle(p),
            overflow: "hidden",
          };
          return node.type.resolvedName === "StudioText" ? (
            <div key={id} style={style}>
              {resolveStudioText(p)}
            </div>
          ) : node.type.resolvedName === "StudioImage" ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={id}
              alt=""
              src={p.src}
              style={{ ...style, objectFit: p.objectFit, margin: 0, border: 0 }}
            />
          ) : null;
        })}
      </div>
    </div>
  );
}
