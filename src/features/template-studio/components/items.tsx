"use client";

import { useEditor, useNode } from "@craftjs/core";
import type { CSSProperties, ReactNode } from "react";
import { useContext, useState } from "react";
import { WordingPreviewContext } from "./wording-preview";
import { resolveStudioText } from "./wording-text";

export type ItemProps = {
  cover?: import("./invitation-cover").CoverConfig;
  revealPreset?: "none" | "fade" | "slide-up" | "scale-in";
  revealDuration?: number;
  revealDelay?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  text?: string;
  textBinding?: "invitationWording";
  fontSize?: number;
  color?: string;
  src?: string;
  eventDate?: string;
  eventTime?: string;
  timezone?: "Asia/Ho_Chi_Minh" | "UTC";
  fontFamily?: "Arial" | "Georgia" | "EB Garamond";
  background?: string;
  accent?: string;
  title?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  uppercase?: boolean;
  textAlign?: "left" | "center" | "right" | "justify";
  lineHeight?: number;
  opacity?: number;
  objectFit?: "cover" | "contain";
  borderRadius?: number;
  imageShape?: "rectangle" | "arch" | "oval" | "scallop";
  flipX?: boolean;
  address?: string;
  images?: string[];
  action?: "rsvp" | "calendar" | "gift";
  message?: string;
  questions?: { question: string; answer: string }[];
  milestones?: { time: string; title: string; description: string }[];
};

export function itemStyle(props: ItemProps, selected: boolean, enabled = false): CSSProperties {
  return {
    position: "absolute",
    left: props.x ?? 40,
    top: props.y ?? 40,
    width: props.width ?? 220,
    height: props.height ?? 70,
    transform: `rotate(${props.rotation ?? 0}deg)`,
    outline: selected ? "1px solid #477565" : undefined,
    cursor: "pointer",
    touchAction: enabled ? "none" : "auto",
  };
}

export function imageShapeStyle(props: ItemProps): CSSProperties {
  const scallop =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M20 0H80Q90 0 90 10Q100 10 100 20V80Q100 90 90 90Q90 100 80 100H20Q10 100 10 90Q0 90 0 80V20Q0 10 10 10Q10 0 20 0Z"/></svg>';
  return {
    borderRadius:
      props.imageShape === "arch"
        ? "50% 50% 0 0"
        : props.imageShape === "oval"
          ? "50%"
          : (props.borderRadius ?? 0),
    maskImage:
      props.imageShape === "scallop"
        ? `url("data:image/svg+xml,${encodeURIComponent(scallop)}")`
        : undefined,
    maskSize: "100% 100%",
    maskRepeat: "no-repeat",
  };
}

export function studioTextStyle(props: ItemProps): CSSProperties {
  return {
    fontSize: props.fontSize ?? 32,
    color: props.color ?? "#493a34",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    lineHeight: props.lineHeight ?? 1.2,
    fontFamily: props.fontFamily ?? "Arial",
    fontWeight: props.bold ? 700 : 400,
    fontStyle: props.italic ? "italic" : "normal",
    textDecoration:
      [props.underline ? "underline" : "", props.strike ? "line-through" : ""]
        .filter(Boolean)
        .join(" ") || "none",
    textTransform: props.uppercase ? "uppercase" : "none",
    textAlign: props.textAlign ?? "left",
    background: props.background ?? "transparent",
    borderRadius: props.borderRadius ?? 0,
    opacity: props.opacity ?? 1,
  };
}

export function StudioText(props: ItemProps) {
  const wording = useContext(WordingPreviewContext);
  const { enabled } = useEditor((state) => ({ enabled: state.options.enabled }));
  const [editing, setEditing] = useState(false);
  const {
    id,
    connectors: { connect },
    selected,
    actions: { setProp },
  } = useNode((node) => ({ selected: node.events.selected }));
  return (
    <div
      ref={(element) => {
        if (element) connect(element);
        if (element && editing && !props.textBinding) element.focus();
      }}
      data-studio-node={id}
      contentEditable={editing && !props.textBinding}
      suppressContentEditableWarning
      onDoubleClick={() => {
        if (enabled && !props.textBinding) setEditing(true);
      }}
      onBlur={(event) => {
        if (editing) {
          if (!props.textBinding) {
            const text = event.currentTarget.innerText.slice(0, 10000);
            setProp((value: ItemProps) => {
              value.text = text;
            });
          }
          setEditing(false);
        }
      }}
      style={{
        ...itemStyle(props, selected, enabled),
        ...studioTextStyle(props),
        cursor: editing && !props.textBinding ? "text" : "pointer",
      }}
    >
      {resolveStudioText(props, wording)}
    </div>
  );
}
StudioText.craft = {
  displayName: "Chữ",
  props: {
    x: 55,
    y: 80,
    width: 370,
    height: 80,
    rotation: 0,
    text: "Minh & Lan",
    fontSize: 42,
    color: "#493a34",
  },
};

export function StudioImage(props: ItemProps) {
  const { enabled } = useEditor((state) => ({ enabled: state.options.enabled }));
  const {
    id,
    connectors: { connect },
    selected,
  } = useNode((node) => ({ selected: node.events.selected }));
  return (
    <div
      ref={(element) => {
        if (element) connect(element);
      }}
      data-studio-node={id}
      style={{
        ...itemStyle(props, selected, enabled),
        opacity: props.opacity ?? 1,
        ...imageShapeStyle(props),
        overflow: "hidden",
      }}
    >
      {/* Editor needs the actual DOM image inside a freely transformed item. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={props.src ?? "/images/templates/invite-portrait.png"}
        alt="Ảnh minh họa"
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: props.objectFit ?? "cover",
          pointerEvents: "none",
          transform: props.flipX ? "scaleX(-1)" : undefined,
        }}
      />
    </div>
  );
}
StudioImage.craft = {
  displayName: "Ảnh",
  props: {
    x: 55,
    y: 210,
    width: 370,
    height: 420,
    rotation: 0,
    src: "/images/templates/invite-portrait.png",
  },
};

export function StudioFrame({
  children,
  background = "#fffaf1",
  width = 480,
  height = 760,
  src,
}: {
  children?: ReactNode;
  background?: string;
  width?: number;
  height?: number;
  src?: string;
}) {
  const {
    connectors: { connect },
  } = useNode();
  return (
    <div
      ref={(element) => {
        if (element) connect(element);
      }}
      data-studio-frame
      style={{
        position: "relative",
        width,
        height,
        background,
        backgroundImage: src ? `url(${src})` : undefined,
        backgroundSize: "100% auto",
        backgroundBlendMode: "multiply",
        boxShadow: "0 12px 50px #00000012",
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}
StudioFrame.craft = { displayName: "Khung / nền", props: { background: "#fffaf1" } };
