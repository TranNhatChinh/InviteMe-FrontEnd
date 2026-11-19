"use client";
import { ImportedGiftPreview } from "../components/gift-preview";
import { useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ImportedWidget } from "../schemas/document";
import { moveWidget } from "./document";

export function ImportedWidgetOverlay({
  widgets,
  editable = false,
  selectedId,
  guestToken,
  onSelect,
  onChange,
}: {
  widgets: ImportedWidget[];
  editable?: boolean;
  selectedId?: string | null;
  guestToken?: string;
  onSelect?: (id: string) => void;
  onChange?: (widget: ImportedWidget) => void;
}) {
  const { t } = useTranslation("invitations", { keyPrefix: "imported" });
  const [giftPreview, setGiftPreview] = useState(false);
  const drag = useRef<{
    widget: ImportedWidget;
    left: number;
    top: number;
    width: number;
    height: number;
    x: number;
    y: number;
  } | null>(null);
  const [moving, setMoving] = useState<ImportedWidget | null>(null);
  function start(event: PointerEvent<HTMLButtonElement>, widget: ImportedWidget) {
    if (!editable || event.button !== 0) return;
    event.preventDefault();
    onSelect?.(widget.id);
    const parent = event.currentTarget.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    drag.current = {
      widget,
      left: event.clientX,
      top: event.clientY,
      width: rect.width,
      height: rect.height,
      x: widget.x,
      y: widget.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (!active) return;
    const next = moveWidget(
      active.widget,
      active.widget.x + (event.clientX - active.left) / active.width,
      active.widget.y + (event.clientY - active.top) / active.height,
    );
    active.x = next.x;
    active.y = next.y;
    setMoving(next);
  }
  function end(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    drag.current = null;
    setMoving(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (active && (active.x !== active.widget.x || active.y !== active.widget.y))
      onChange?.(moveWidget(active.widget, active.x, active.y));
  }
  return (
    <>
      <ImportedGiftPreview open={giftPreview} onClose={() => setGiftPreview(false)} />
      {widgets
        .filter((widget) => editable || widget.enabled)
        .map((original) => {
          const widget = moving?.id === original.id ? moving : original;
          return (
            <button
              key={widget.id}
              type="button"
              data-import-widget={widget.id}
              aria-label={editable ? t("selectWidget", { label: widget.label }) : widget.label}
              aria-pressed={editable ? selectedId === widget.id : undefined}
              title={editable ? t("dragWidget") : !guestToken ? t("widgetPreview") : undefined}
              className={`absolute z-10 flex items-center justify-center overflow-hidden rounded-full px-1 font-semibold ${editable ? "touch-none cursor-move" : "cursor-pointer"} ${editable && selectedId === widget.id ? "outline-2 outline-offset-2 outline-blue-500" : ""}`}
              style={{
                left: `${widget.x * 100}%`,
                top: `${widget.y * 100}%`,
                width: `${widget.width * 100}%`,
                height: `${widget.height * 100}%`,
                backgroundColor: widget.backgroundColor,
                color: widget.textColor,
                opacity: widget.enabled ? 1 : 0.4,
                fontSize: "clamp(8px, 3cqw, 18px)",
              }}
              onPointerDown={(event) => start(event, widget)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={() => {
                drag.current = null;
                setMoving(null);
              }}
              onKeyDown={(event) => {
                if (!editable) return;
                const step = event.shiftKey ? 0.05 : 0.01;
                const offset: Record<string, [number, number]> = {
                  ArrowLeft: [-step, 0],
                  ArrowRight: [step, 0],
                  ArrowUp: [0, -step],
                  ArrowDown: [0, step],
                };
                const delta = offset[event.key];
                if (!delta) return;
                event.preventDefault();
                onSelect?.(widget.id);
                onChange?.(moveWidget(widget, widget.x + delta[0], widget.y + delta[1]));
              }}
              onClick={() => {
                if (editable) {
                  onSelect?.(widget.id);
                  return;
                }
                if (!guestToken && widget.type === "GIFT") {
                  setGiftPreview(true);
                  return;
                }
                if (guestToken)
                  window.dispatchEvent(
                    new CustomEvent(
                      widget.type === "GIFT" ? "inviteme:open-gift" : "inviteme:open-rsvp",
                      { detail: { token: guestToken } },
                    ),
                  );
              }}
            >
              <span className="truncate">{widget.label}</span>
            </button>
          );
        })}
    </>
  );
}
