"use client";
import { useTranslation } from "react-i18next";
import { ClipboardCheck, Gift } from "lucide-react";
import type { TemplateStudioProps } from "../editor/studio.types";
import type { GiftSettings } from "../schemas/document";
import { Button } from "@/shared/ui/button";
import type { ImportedPage, ImportedWidget } from "../schemas/document";

export function ImportedWidgetsPanel({
  gift,
  onGiftChange,
  giftPanel,
  pages,
  widgets,
  selectedId,
  onSelect,
  onChange,
  disabled,
}: {
  gift?: GiftSettings;
  onGiftChange: (gift: GiftSettings) => void;
  giftPanel?: TemplateStudioProps["giftPanel"];
  pages: ImportedPage[];
  widgets: ImportedWidget[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (widgets: ImportedWidget[]) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation("invitations", { keyPrefix: "imported" });
  const selected = widgets.find((widget) => widget.id === selectedId);
  function patch(value: Partial<ImportedWidget>) {
    if (!selected) return;
    const next = { ...selected, ...value };
    next.x = Math.max(0, Math.min(next.x, 1 - next.width));
    next.y = Math.max(0, Math.min(next.y, 1 - next.height));
    onChange(widgets.map((widget) => (widget.id === next.id ? next : widget)));
  }
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <h2 className="text-sm font-semibold">{t("widgets")}</h2>
      <div className="grid grid-cols-2 gap-2.5">
        {(["RSVP", "GIFT"] as const).map((type) => (
          <button
            key={type}
            type="button"
            className="flex min-h-[98px] flex-col items-center justify-center gap-[7px] rounded-lg border border-[#eedfe3] bg-white px-1.5 py-3 text-center text-[11px] text-[#62434e] hover:bg-pink-50 disabled:opacity-50"
            disabled={disabled || !pages.length || widgets.length >= 24}
            onClick={() => {
              const page = pages.find((page) => page.id === selected?.pageId) ?? pages[0];
              if (!page) return;
              const height = Math.min(0.18, Math.max(0.001, (0.08 * page.width) / page.height));
              const widget: ImportedWidget = {
                id: crypto.randomUUID(),
                type,
                pageId: page.id,
                enabled: true,
                x: 0.25,
                y: Math.max(
                  0.02,
                  0.8 -
                    widgets.filter((widget) => widget.pageId === page.id).length * (height + 0.04),
                ),
                width: 0.5,
                height,
                label: t(type === "GIFT" ? "defaultGift" : "defaultRsvp"),
                backgroundColor: "#cf7892",
                textColor: "#ffffff",
              };
              onChange([...widgets, widget]);
              onSelect(widget.id);
            }}
          >
            {type === "GIFT" ? (
              <Gift size={32} strokeWidth={1.7} className="text-[#cf7892]" aria-hidden="true" />
            ) : (
              <ClipboardCheck
                size={32}
                strokeWidth={1.7}
                className="text-[#cf7892]"
                aria-hidden="true"
              />
            )}
            <span>{t(type === "GIFT" ? "defaultGift" : "defaultRsvp")}</span>
          </button>
        ))}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{t("placeWidget")}</p>
      <div className="grid gap-2">
        {widgets.map((widget) => (
          <button
            key={widget.id}
            type="button"
            className={`rounded-lg border p-3 text-left text-xs ${widget.id === selectedId ? "border-primary bg-pink-50" : "bg-white"}`}
            aria-pressed={widget.id === selectedId}
            onClick={() => onSelect(widget.id)}
          >
            <span className="flex items-center gap-2">
              {widget.type === "GIFT" ? (
                <Gift size={16} className="shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <ClipboardCheck size={16} className="shrink-0 text-primary" aria-hidden="true" />
              )}
              <strong className="block truncate">{widget.label}</strong>
            </span>
            <span className="mt-1 block text-muted-foreground">
              {t("page", { number: pages.findIndex((page) => page.id === widget.pageId) + 1 })} ·{" "}
              {t(widget.enabled ? "widgetVisible" : "widgetHidden")}
            </span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="space-y-4 border-t pt-4 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.enabled}
              onChange={(event) => patch({ enabled: event.target.checked })}
            />
            {t("showWidget")}
          </label>
          <label className="grid gap-2">
            {t("widgetPage")}
            <select
              className="w-full rounded border p-2"
              value={selected.pageId}
              onChange={(event) => patch({ pageId: event.target.value })}
            >
              {pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {t("page", { number: page.order + 1 })}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            {t("widgetLabel")}
            <input
              className="w-full rounded border p-2"
              maxLength={80}
              value={selected.label}
              onChange={(event) => patch({ label: event.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(["backgroundColor", "textColor"] as const).map((key) => (
              <label key={key} className="grid gap-2">
                {t(`widgetAppearance.${key}`)}
                <input
                  type="color"
                  className="h-9 w-full"
                  value={selected[key]}
                  onChange={(event) => patch({ [key]: event.target.value })}
                />
              </label>
            ))}
          </div>
          {selected.type === "GIFT" && giftPanel?.({ value: gift, onChange: onGiftChange })}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              onChange(widgets.filter((widget) => widget.id !== selected.id));
              onSelect(null);
            }}
          >
            {t("deleteWidget")}
          </Button>
        </div>
      )}
    </fieldset>
  );
}
