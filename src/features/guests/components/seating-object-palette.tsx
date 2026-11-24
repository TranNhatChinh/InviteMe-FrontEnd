"use client";

import { DoorOpen, Gift, Layers, Music2, PanelTop, MoveVertical, X } from "lucide-react";
import Image from "next/image";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import type { TableShape } from "../api/planning-seating.api";

export const seatingObjectIcons = {
  danceFloor: Music2,
  giftTable: Gift,
  entrance: DoorOpen,
  aisle: MoveVertical,
  stage: PanelTop,
};
export type SeatingObjectKind = keyof typeof seatingObjectIcons;
export const seatingPaletteMime = "application/x-inviteme-seating-item";
export type SeatingTableItem = "table" | "tableTwoSided" | "tableFourSided";
export type SeatingCanvasObject = {
  id: string;
  point?: { x: number; y: number };
  kind: SeatingObjectKind;
};

const paletteImages = {
  table: "round-table",
  tableTwoSided: "table-2-sided",
  tableFourSided: "table-4-sided",
  aisle: "aisle",
  stage: "stage-floral",
  danceFloor: "dance-floor",
  giftTable: "gift-table",
  entrance: "entrance",
} as const;

function PaletteIllustration({ kind }: { kind: keyof typeof paletteImages }) {
  return (
    <Image
      src={`/images/seating/palette/${paletteImages[kind]}.${["stage", "tableTwoSided", "tableFourSided"].includes(kind) ? "png" : "webp"}`}
      alt=""
      width={64}
      height={64}
      draggable={false}
      className={`size-14 shrink-0 object-contain ${kind === "tableTwoSided" || kind === "tableFourSided" ? "scale-[1.35]" : ""}`}
    />
  );
}

export function SeatingObjectPalette({
  onTable,
  onObject,
  onClose,
  tableDisabled,
}: {
  onTable: (shape: TableShape) => void;
  onObject: (kind: SeatingCanvasObject["kind"]) => void;
  onClose: () => void;
  tableDisabled?: boolean;
}) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "studio" });
  const dragItem = (kind: SeatingCanvasObject["kind"] | SeatingTableItem) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent<HTMLButtonElement>) => {
      event.dataTransfer.setData(seatingPaletteMime, kind);
      event.dataTransfer.effectAllowed = "copy";
    },
  });
  const tile =
    "flex min-h-24 min-w-0 flex-col items-center justify-start gap-2 rounded-lg p-1 text-center text-xs leading-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";
  return (
    <section className="space-y-6 bg-card p-5 sm:p-6 " aria-label={t("addObjects")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("addObjects")}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("closePalette")}
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium">{t("guestTables")}</h3>
        <div className="grid grid-cols-4">
          {(
            [
              { kind: "table", shape: "round", label: "roundTable" },
              { kind: "tableTwoSided", shape: "twoSided", label: "twoSidedTable" },
              { kind: "tableFourSided", shape: "fourSided", label: "fourSidedTable" },
            ] as const
          ).map(({ kind, shape, label }) => (
            <button
              key={kind}
              type="button"
              className={tile}
              {...(!tableDisabled && dragItem(kind))}
              disabled={tableDisabled}
              onClick={() => onTable(shape)}
            >
              <PaletteIllustration kind={kind} />
              {t(label)}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium">{t("roomObjects")}</h3>
        <div className="grid grid-cols-4">
          {(["aisle", "stage"] as const).map((kind) => (
            <button
              type="button"
              key={kind}
              className={tile}
              {...dragItem(kind)}
              onClick={() => onObject(kind)}
            >
              <PaletteIllustration kind={kind} />
              {t(kind)}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {(["danceFloor", "giftTable", "entrance"] as const).map((kind) => {
          const heading = {
            danceFloor: "entertainment",
            giftTable: "eventTables",
            entrance: "entrances",
          } as const;
          return (
            <div key={kind} className="space-y-2 pb-3">
              <h3 className="text-sm font-medium">{t(heading[kind])}</h3>
              <div className="grid grid-cols-4">
                <button
                  type="button"
                  className={tile}
                  {...dragItem(kind)}
                  onClick={() => onObject(kind)}
                >
                  <PaletteIllustration kind={kind} />
                  {t(kind)}
                </button>
              </div>
            </div>
          );
        })}
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Layers className="size-4 shrink-0" />
          {t("objectsTemporary")}
        </p>
      </div>
    </section>
  );
}
