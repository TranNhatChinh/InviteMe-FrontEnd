"use client";

import {
  Armchair,
  DoorOpen,
  Gift,
  Layers,
  Music2,
  PanelTop,
  RectangleHorizontal,
  MoveVertical,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";

export const seatingObjectIcons = {
  danceFloor: Music2,
  giftTable: Gift,
  entrance: DoorOpen,
  aisle: MoveVertical,
  stage: PanelTop,
};
export type SeatingObjectKind = keyof typeof seatingObjectIcons;
export const seatingPaletteMime = "application/x-inviteme-seating-item";
export type SeatingCanvasObject = {
  id: string;
  point?: { x: number; y: number };
  kind: SeatingObjectKind | "brideArea" | "groomArea";
};

export function SeatingObjectPalette({
  onTable,
  onObject,
  onClose,
  tableDisabled,
}: {
  onTable: () => void;
  onObject: (kind: SeatingCanvasObject["kind"]) => void;
  onClose: () => void;
  tableDisabled?: boolean;
}) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "studio" });
  const dragItem = (kind: SeatingCanvasObject["kind"] | "table") => ({
    draggable: true,
    onDragStart: (event: React.DragEvent<HTMLButtonElement>) => {
      event.dataTransfer.setData(seatingPaletteMime, kind);
      event.dataTransfer.effectAllowed = "copy";
    },
  });
  const tile =
    "flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-lg p-1 text-center text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";
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
          <button
            type="button"
            className={tile}
            {...(!tableDisabled && dragItem("table"))}
            disabled={tableDisabled}
            onClick={onTable}
          >
            <span className="grid size-12 place-items-center rounded-xl bg-rose-100 text-rose-800">
              <Armchair className="size-7" />
            </span>
            {t("roundTable")}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium">{t("roomObjects")}</h3>
        <div className="grid grid-cols-4">
          {(["brideArea", "groomArea", "aisle", "stage"] as const).map((kind) => (
            <button
              type="button"
              key={kind}
              className={tile}
              {...dragItem(kind)}
              onClick={() => onObject(kind)}
            >
              <RectangleHorizontal aria-hidden="true" className="size-6 text-primary" />
              {t(kind)}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {(["danceFloor", "giftTable", "entrance"] as const).map((kind) => {
          const Icon = seatingObjectIcons[kind];
          const heading = {
            danceFloor: "entertainment",
            giftTable: "eventTables",
            entrance: "entrances",
          } as const;
          const color = {
            danceFloor: "bg-sky-100 text-sky-900",
            giftTable: "bg-amber-100 text-amber-900",
            entrance: "bg-emerald-100 text-emerald-900",
          };
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
                  <span className={`grid size-12 place-items-center rounded-xl ${color[kind]}`}>
                    <Icon className="size-7" />
                  </span>
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
