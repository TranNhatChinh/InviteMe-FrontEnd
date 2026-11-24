"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import { Copy, Minus, Mouse, Pencil, Plus, Scan, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import type { CanvasLayout, SeatingPlan, TableShape } from "../api/planning-seating.api";
import type { SeatingTable } from "../utils/seating-layout";
import { resizeStage } from "../utils/seating-stage-resize";

import {
  seatingObjectIcons,
  seatingPaletteMime,
  type SeatingCanvasObject,
  type SeatingTableItem,
} from "./seating-object-palette";

function layoutKey(layout: CanvasLayout | null | undefined) {
  return JSON.stringify(layout ?? null, (_key, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  });
}
type Point = { x: number; y: number };
const spacing = 270;
const top = 202;
const aisleWidth = 128;
const tableWidth = 234;
const resizeCorners = [
  { key: "nw", west: true, north: true, classes: "-left-2 -top-2 cursor-nwse-resize" },
  { key: "ne", west: false, north: true, classes: "-right-2 -top-2 cursor-nesw-resize" },
  { key: "sw", west: true, north: false, classes: "-left-2 -bottom-2 cursor-nesw-resize" },
  { key: "se", west: false, north: false, classes: "-right-2 -bottom-2 cursor-nwse-resize" },
] as const;

export function SeatingCanvas({
  plan,
  editable,
  renderTable,
  objects = [],
  onRemoveObject,
  onPaletteDrop,
  tablePositions,
  tableShapes = {},
  onEditTable,
  onDuplicateTable,
  onDeleteTable,
  onSaveLayout,
  onCaptureLayout,
  saving,
}: {
  plan: SeatingPlan;
  editable: boolean;
  onSaveLayout?: (layout: CanvasLayout, version: number) => Promise<boolean>;
  onCaptureLayout?: (layout: CanvasLayout) => void;
  saving?: boolean;
  objects?: SeatingCanvasObject[];
  onPaletteDrop?: (kind: SeatingCanvasObject["kind"] | SeatingTableItem, point: Point) => void;
  tablePositions?: Record<string, Point>;
  tableShapes?: Record<string, TableShape>;
  onEditTable?: (table: SeatingTable) => void;
  onDuplicateTable?: (table: SeatingTable, point: Point) => void;
  onDeleteTable?: (table: SeatingTable) => void;
  onRemoveObject?: (id: string) => void;
  renderTable: (table: SeatingTable) => ReactNode;
}) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "studio" });
  const viewport = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const pointer = useRef<Point | null>(null);
  const panDrag = useRef<{ pointerId: number; start: Point; offset: Point } | null>(null);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [showHint, setShowHint] = useState(true);
  const [panning, setPanning] = useState(false);
  const zoomAnchor = useRef<{ client: Point; canvas: Point } | null>(null);
  const [zoom, setZoom] = useState(0.85);
  const requestedZoom = useRef(zoom);

  useLayoutEffect(() => {
    const view = viewport.current;
    const layer = surface.current;
    const anchor = zoomAnchor.current;
    if (!view || !layer || !anchor) return;
    zoomAnchor.current = null;
    const rect = layer.getBoundingClientRect();
    view.scrollLeft += rect.left + anchor.canvas.x * zoom - anchor.client.x;
    view.scrollTop += rect.top + anchor.canvas.y * zoom - anchor.client.y;
  }, [zoom]);

  useEffect(() => {
    const view = viewport.current;
    if (!view) return;

    function zoomAt(client: Point, factor: number) {
      const layer = surface.current;
      if (!layer) return;
      const next = Math.max(0.2, Math.min(1.6, requestedZoom.current * factor));
      if (next === requestedZoom.current) return;
      const rect = layer.getBoundingClientRect();
      const renderedScale = rect.width / layer.offsetWidth;
      if (!renderedScale) return;
      zoomAnchor.current = {
        client,
        canvas: {
          x: (client.x - rect.left) / renderedScale,
          y: (client.y - rect.top) / renderedScale,
        },
      };
      requestedZoom.current = next;
      setZoom(next);
    }

    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1;
      const delta = Math.max(-120, Math.min(120, event.deltaY * unit));
      zoomAt({ x: event.clientX, y: event.clientY }, Math.exp(-delta * 0.0008));
    }

    function onKeyDown(event: KeyboardEvent) {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey || !pointer.current) return;
      if (document.querySelector("dialog[open]")) return;
      const { x, y } = pointer.current;
      const hovered = document.elementFromPoint(x, y);
      if (!hovered || !view?.contains(hovered)) return;
      const factor = event.key === "+" || event.key === "=" ? 1.2 : event.key === "-" ? 1 / 1.2 : 0;
      if (!factor) return;
      event.preventDefault();
      zoomAt({ x, y }, factor);
    }

    view.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      view.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function setToolbarZoom(next: number) {
    zoomAnchor.current = null;
    requestedZoom.current = next;
    setZoom(next);
  }
  const [positions, setPositions] = useState<Record<string, Point>>(() => {
    const saved = plan.canvasLayout;
    if (!saved) return {};
    return {
      ...Object.fromEntries(Object.entries(saved.tables).map(([id, { x, y }]) => [id, { x, y }])),
      ...(saved.stage ? { stage: saved.stage } : {}),
      ...(saved.stage?.width && saved.stage?.height
        ? { "objectSize:stage": { x: saved.stage.width, y: saved.stage.height } }
        : {}),
      ...Object.fromEntries(saved.objects.map(({ id, x, y }) => [id, { x, y }])),
      ...Object.fromEntries(
        saved.objects
          .filter((item) => item.width && item.height)
          .map((item) => [
            `objectSize:${item.id}`,
            { x: item.width ?? 250, y: item.height ?? 160 },
          ]),
      ),
    };
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const drag = useRef<{
    id: string;
    pointerId: number;
    pointer: Point;
    grab: Point;
    original: Point;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const brideWidth = plan.brideTablesPerRow ?? 2;
  const groomWidth = plan.groomTablesPerRow ?? 2;
  const receptionMode = plan.canvasLayout?.receptionMode ?? "JOINT";
  const single = receptionMode !== "JOINT";
  const singleWidth = receptionMode === "BRIDE" ? brideWidth : groomWidth;
  const looseWidth = single ? singleWidth : brideWidth;
  const aisleStart = brideWidth * spacing + 14;
  const center = single ? (singleWidth * spacing + 32) / 2 : aisleStart + aisleWidth / 2;
  const groomStart = aisleStart + aisleWidth + 18;
  const hallWidth = single
    ? singleWidth * spacing + 32
    : groomStart + (groomWidth - 1) * spacing + tableWidth + 32;
  const looseTables = plan.tables.filter((table) => !table.side || !table.row || !table.column);
  const lastRow = Math.max(0, ...plan.tables.map((table) => table.row ?? 0));
  const layout = plan.tables.map((table) => {
    const index = looseTables.indexOf(table);
    const row = index < 0 ? (table.row ?? 1) - 1 : lastRow + Math.floor(index / looseWidth);
    const column = index < 0 ? (table.column ?? 1) - 1 : index % looseWidth;
    const initial = {
      x: (!single && table.side === "GROOM" ? groomStart : 32) + column * spacing,
      y: top + row * spacing,
    };
    return { table, point: positions[table.id] ?? tablePositions?.[table.id] ?? initial };
  });
  const stage = positions.stage ?? { x: center - 125, y: 48 };
  const stageSize = (id: string) => positions[`objectSize:${id}`] ?? { x: 250, y: 160 };
  const objectLayout = objects.map((object, index) => ({
    ...object,
    point: positions[object.id] ??
      object.point ?? {
        x: center - 95 + (index % 2) * 210,
        y: top + lastRow * spacing + Math.floor(index / 2) * 112,
      },
  }));
  const [baseVersion, setBaseVersion] = useState(plan.version);
  const [baseLayout, setBaseLayout] = useState(plan.canvasLayout);
  const snapshot: CanvasLayout = {
    receptionMode,
    splitZones: false,
    tables: Object.fromEntries(
      layout.map(({ table, point }) => {
        return [
          table.id,
          {
            ...point,
            ...((tableShapes[table.id] ?? plan.canvasLayout?.tables[table.id]?.shape)
              ? { shape: tableShapes[table.id] ?? plan.canvasLayout?.tables[table.id]?.shape }
              : {}),
          },
        ];
      }),
    ),
    zones: {},
    stage: plan.canvasLayout?.stage
      ? { ...stage, width: stageSize("stage").x, height: stageSize("stage").y }
      : null,
    objects: objectLayout.map(({ id, kind, point }) => ({
      id,
      type: kind,
      ...point,
      ...(kind === "stage" ? { width: stageSize(id).x, height: stageSize(id).y } : {}),
    })),
  };
  useEffect(() => {
    onCaptureLayout?.(snapshot);
  });

  const layoutVersion =
    layoutKey(baseLayout) === layoutKey(plan.canvasLayout) ? plan.version : baseVersion;
  const points = [...layout, ...objectLayout].map(({ point }) => point);
  const padding = 32;
  const left = Math.min(0, stage.x - padding, ...points.map((point) => point.x - padding));
  const upper = Math.min(0, stage.y - padding, ...points.map((point) => point.y - padding));
  const width =
    Math.max(
      hallWidth,
      stage.x + stageSize("stage").x + padding,
      ...objectLayout
        .filter(({ kind }) => kind === "stage")
        .map(({ id, point }) => point.x + stageSize(id).x + padding),
      ...points.map((point) => point.x + spacing),
    ) - left;
  const height =
    Math.max(
      480,
      stage.y + stageSize("stage").y + padding,
      ...objectLayout
        .filter(({ kind }) => kind === "stage")
        .map(({ id, point }) => point.y + stageSize(id).y + padding),
      ...points.map((point) => point.y + spacing),
    ) - upper;
  const previousOrigin = useRef<Point | null>(null);

  useLayoutEffect(() => {
    const view = viewport.current;
    const rect = surface.current?.getBoundingClientRect();
    const previous = previousOrigin.current;
    previousOrigin.current = null;
    if (!view || !rect || !previous) return;
    view.scrollLeft += rect.left - left * zoom - previous.x;
    view.scrollTop += rect.top - upper * zoom - previous.y;
  });

  function place(id: string, point: Point) {
    const rect = surface.current?.getBoundingClientRect();
    if (rect) previousOrigin.current = { x: rect.left - left * zoom, y: rect.top - upper * zoom };
    if (id.startsWith("resizeStage:")) {
      const objectId = id.slice("resizeStage:".length, id.lastIndexOf(":"));
      const corner = resizeCorners.find((item) => id.endsWith(`:${item.key}`));
      const origin =
        objectId === "stage" ? stage : objectLayout.find((item) => item.id === objectId)?.point;
      if (!origin || !corner) return;
      const size = stageSize(objectId);
      const next = resizeStage({ ...origin, width: size.x, height: size.y }, point, corner);
      setPositions((current) => ({
        ...current,
        [objectId]: { x: next.x, y: next.y },
        [`objectSize:${objectId}`]: { x: next.width, y: next.height },
      }));
      return;
    }
    setPositions((current) => ({ ...current, [id]: point }));
  }

  function start(event: PointerEvent<HTMLElement>, id: string, origin: Point) {
    suppressClick.current = false;
    if (event.button !== 0 || !event.isPrimary || !editable || drag.current) return;
    if (
      event.target instanceof Element &&
      event.target.closest("[data-seating-canvas-interactive]")
    )
      return;
    const rect = surface.current?.getBoundingClientRect();
    if (!rect) return;
    if (!id.startsWith("resizeStage:")) setSelectedId(id);
    if (id.startsWith("resizeStage:")) event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id,
      original: origin,
      pointerId: event.pointerId,
      pointer: { x: event.clientX, y: event.clientY },
      grab: {
        x: (event.clientX - rect.left) / zoom + left - origin.x,
        y: (event.clientY - rect.top) / zoom + upper - origin.y,
      },
      moved: false,
    };
  }
  function move(event: PointerEvent<HTMLElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (!active.moved) {
      if (Math.hypot(event.clientX - active.pointer.x, event.clientY - active.pointer.y) < 5)
        return;
      active.moved = true;
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setMovingId(active.id);
    }
    const rect = surface.current?.getBoundingClientRect();
    if (!rect) return;
    place(active.id, {
      x: Math.round((event.clientX - rect.left) / zoom + left - active.grab.x),
      y: Math.round((event.clientY - rect.top) / zoom + upper - active.grab.y),
    });
  }
  function moveWithKey(event: React.KeyboardEvent<HTMLDivElement>, id: string, point: Point) {
    if (!editable) return;
    if (event.target !== event.currentTarget) return;
    const delta = {
      ArrowLeft: [-10, 0],
      ArrowRight: [10, 0],
      ArrowUp: [0, -10],
      ArrowDown: [0, 10],
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    const [dx = 0, dy = 0] = delta;
    const next = { x: point.x + dx, y: point.y + dy };
    place(id, next);
  }

  function leave(id: string) {
    if (drag.current?.id === id && !drag.current.moved) drag.current = null;
  }

  function finish(event: PointerEvent<HTMLElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    setMovingId(null);
  }

  function finishPan(event: PointerEvent<HTMLDivElement>) {
    if (panDrag.current?.pointerId !== event.pointerId) return;
    panDrag.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function frameClass(id: string) {
    if (!editable) return "";
    return movingId === id
      ? "z-20 cursor-grabbing touch-none select-none outline-2 outline-sky-400"
      : `cursor-grab touch-none select-none [&_button]:cursor-grab [&_[data-seating-canvas-interactive]]:cursor-pointer ${selectedId === id ? "z-10 outline-2 outline-sky-400" : ""}`;
  }

  function selectionDots(id: string) {
    if (!editable || selectedId !== id) return null;
    return (
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
        {[
          "left-0 top-0",
          "left-1/2 top-0",
          "left-full top-0",
          "left-0 top-1/2",
          "left-full top-1/2",
          "left-0 top-full",
          "left-1/2 top-full",
          "left-full top-full",
        ].map((position) => (
          <span
            key={position}
            className={`absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-500 ${position}`}
          />
        ))}
      </span>
    );
  }

  function stageResizeControls(id: string, origin: Point) {
    if (!editable || selectedId !== id) return null;
    const size = stageSize(id);
    return resizeCorners.map((corner) => {
      const resizeId = `resizeStage:${id}:${corner.key}`;
      const point = {
        x: origin.x + (corner.west ? 0 : size.x),
        y: origin.y + (corner.north ? 0 : size.y),
      };
      return (
        <div
          key={corner.key}
          role="group"
          tabIndex={0}
          aria-label={t("resizeZone", { name: t("stage") })}
          className={`absolute z-30 size-4 touch-none rounded-full border-2 border-white bg-sky-500 focus-visible:ring-2 focus-visible:ring-sky-500 ${corner.classes}`}
          onPointerDown={(event) => {
            event.stopPropagation();
            start(event, resizeId, point);
          }}
          onPointerMove={(event) => {
            event.stopPropagation();
            move(event);
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            finish(event);
          }}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
          onPointerLeave={() => leave(resizeId)}
          onKeyDown={(event) => {
            event.stopPropagation();
            moveWithKey(event, resizeId, point);
          }}
        />
      );
    });
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#faf9f7]"
      onKeyDown={(event) => {
        if (event.key === "Escape") setSelectedId(null);
      }}
      onClickCapture={(event) => {
        if (!suppressClick.current || event.detail === 0) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDownCapture={(event) => {
        if (event.button === 0) suppressClick.current = false;
      }}
      onPointerDown={(event) => {
        if (
          event.button === 0 &&
          event.target instanceof Element &&
          !event.target.closest("[data-canvas-selection]")
        )
          setSelectedId(null);
      }}
    >
      <div
        ref={viewport}
        onDragOver={(event) => {
          if (!onPaletteDrop || !event.dataTransfer.types.includes(seatingPaletteMime)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          if (!onPaletteDrop || !event.dataTransfer.types.includes(seatingPaletteMime)) return;
          event.preventDefault();
          const kind = event.dataTransfer.getData(seatingPaletteMime);
          const isObject = Object.keys(seatingObjectIcons).some((key) => key === kind);
          if (
            !isObject &&
            kind !== "table" &&
            kind !== "tableTwoSided" &&
            kind !== "tableFourSided"
          )
            return;
          const rect = surface.current?.getBoundingClientRect();
          if (!rect) return;
          const point = {
            x: Math.round((event.clientX - rect.left) / zoom + left),
            y: Math.round((event.clientY - rect.top) / zoom + upper),
          };
          if (kind === "table" || kind === "tableTwoSided" || kind === "tableFourSided") {
            point.x -= tableWidth / 2;
            point.y -= tableWidth / 2;
          }
          onPaletteDrop(kind as SeatingCanvasObject["kind"] | SeatingTableItem, point);
        }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDownCapture={(event) => {
          if (event.button !== 2 || event.buttons !== 2 || drag.current) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          panDrag.current = {
            pointerId: event.pointerId,
            start: { x: event.clientX, y: event.clientY },
            offset: pan,
          };
          setPanning(true);
        }}
        onPointerUp={finishPan}
        onPointerCancel={finishPan}
        onLostPointerCapture={finishPan}
        onPointerEnter={(event) => {
          pointer.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          pointer.current = { x: event.clientX, y: event.clientY };
          const active = panDrag.current;
          if (!active || active.pointerId !== event.pointerId) return;
          if (!(event.buttons & 2)) {
            finishPan(event);
            return;
          }
          setPan({
            x: active.offset.x + event.clientX - active.start.x,
            y: active.offset.y + event.clientY - active.start.y,
          });
        }}
        onPointerLeave={() => {
          pointer.current = null;
        }}
        tabIndex={0}
        aria-label={t("floorPlan")}
        className={`min-h-0 flex-1 overflow-auto overscroll-contain ${panning ? "cursor-grabbing select-none" : ""}`}
      >
        <div
          className="relative min-h-full min-w-full overflow-hidden"
          style={{
            width: width * zoom,
            height: height * zoom,
            backgroundImage: `radial-gradient(circle, #dcd9d5 ${1.25 * zoom}px, transparent ${1.9 * zoom}px)`,
            backgroundSize: `${48 * zoom}px ${48 * zoom}px`,
            backgroundPosition: `calc(50% + ${pan.x}px) ${pan.y}px`,
          }}
        >
          <div
            ref={surface}
            className="absolute top-0 origin-top-left"
            style={{
              left: `max(0px, calc(50% - ${(width * zoom) / 2}px))`,
              width,
              height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            {plan.canvasLayout?.stage && (
              <div
                tabIndex={editable ? 0 : undefined}
                aria-label={editable ? t("move", { name: t("stage") }) : undefined}
                role={editable ? "group" : undefined}
                data-canvas-selection
                onPointerDown={(event) => start(event, "stage", stage)}
                onPointerMove={move}
                onPointerLeave={() => leave("stage")}
                onPointerUp={finish}
                onPointerCancel={finish}
                onLostPointerCapture={finish}
                onKeyDown={(event) => moveWithKey(event, "stage", stage)}
                className={`absolute grid place-items-center text-sm font-semibold text-rose-900 ${frameClass("stage")}`}
                style={{
                  left: stage.x - left,
                  top: stage.y - upper,
                  width: stageSize("stage").x,
                  height: stageSize("stage").y,
                }}
              >
                <Image
                  src="/images/seating/palette/stage-floral.png"
                  alt=""
                  fill
                  sizes="250px"
                  draggable={false}
                  className="pointer-events-none select-none object-contain"
                />
                <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                  {t("stage")}
                </span>
                {stageResizeControls("stage", stage)}
              </div>
            )}
            {objectLayout.map(({ id, kind, point }) => {
              const Icon = seatingObjectIcons[kind];
              return (
                <div
                  key={id}
                  data-canvas-selection
                  tabIndex={editable ? 0 : undefined}
                  role="group"
                  aria-label={t("move", { name: t(kind) })}
                  onPointerDown={(event) => start(event, id, point)}
                  onPointerMove={move}
                  onPointerLeave={() => leave(id)}
                  onPointerUp={finish}
                  onPointerCancel={finish}
                  onLostPointerCapture={finish}
                  onKeyDown={(event) => moveWithKey(event, id, point)}
                  className={`absolute flex items-center justify-center gap-2 rounded-xl text-sm font-medium text-stone-800 ${kind === "stage" ? "" : "border border-stone-300 bg-stone-100"} ${kind === "aisle" ? "h-72 w-32 border-dashed" : kind === "stage" ? "" : "h-20 w-[190px]"} ${frameClass(id)}`}
                  style={{
                    left: point.x - left,
                    top: point.y - upper,
                    ...(kind === "stage"
                      ? { width: stageSize(id).x, height: stageSize(id).y }
                      : {}),
                  }}
                >
                  {kind === "stage" ? (
                    <>
                      <Image
                        src="/images/seating/palette/stage-floral.png"
                        alt=""
                        fill
                        sizes="250px"
                        draggable={false}
                        className="pointer-events-none select-none object-contain"
                      />
                      <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                        {t(kind)}
                      </span>
                    </>
                  ) : (
                    <>
                      <Icon className="size-5" />
                      {t(kind)}
                    </>
                  )}
                  {kind === "stage" ? stageResizeControls(id, point) : selectionDots(id)}
                  {editable && selectedId === id && onRemoveObject && (
                    <button
                      type="button"
                      data-seating-canvas-interactive
                      aria-label={t("removeObject", { name: t(kind) })}
                      className="absolute right-1 top-1 rounded p-1 hover:bg-stone-200"
                      onClick={() => onRemoveObject(id)}
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              );
            })}
            {layout.map(({ table, point }) => (
              <div
                key={table.id}
                data-canvas-selection
                tabIndex={editable ? 0 : undefined}
                aria-label={editable ? t("move", { name: table.name }) : undefined}
                role={editable ? "group" : undefined}
                onFocus={(event) => {
                  if (editable && event.target === event.currentTarget) setSelectedId(table.id);
                }}
                onPointerDown={(event) => start(event, table.id, point)}
                onPointerMove={move}
                onPointerLeave={() => leave(table.id)}
                onPointerUp={finish}
                onPointerCancel={finish}
                onLostPointerCapture={finish}
                onKeyDown={(event) => moveWithKey(event, table.id, point)}
                className={`absolute min-h-[234px] w-[234px] ${frameClass(table.id)}`}
                style={{ left: point.x - left, top: point.y - upper }}
              >
                {renderTable(table)}
                {editable && selectedId === table.id && !movingId && (
                  <div
                    role="group"
                    aria-label={t("tableActions", { name: table.name })}
                    data-seating-canvas-interactive
                    className="absolute -top-14 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-stone-200 bg-white p-1.5 text-stone-800 shadow-md"
                  >
                    {(
                      [
                        { Icon: Pencil, label: "editTable", action: onEditTable },
                        { Icon: Copy, label: "duplicateTable", action: onDuplicateTable },
                        { Icon: Trash2, label: "deleteTable", action: onDeleteTable },
                      ] as const
                    ).map(
                      ({ Icon, label, action }) =>
                        action && (
                          <button
                            key={label}
                            type="button"
                            data-seating-canvas-interactive
                            title={t(label, { name: table.name })}
                            aria-label={t(label, { name: table.name })}
                            disabled={
                              saving || (label === "duplicateTable" && plan.tables.length >= 100)
                            }
                            className="grid size-8 place-items-center rounded-full hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-40"
                            onClick={() => action(table, point)}
                          >
                            <Icon aria-hidden="true" className="size-4" />
                          </button>
                        ),
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {showHint && (
        <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-9.5rem)] flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-rose-200 bg-card px-3 py-2 text-xs shadow-sm">
          <Mouse aria-hidden="true" className="size-4 shrink-0 text-blue-600" />
          <span>{t("panHint")}</span>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          <span className="text-muted-foreground">{t("zoomHint")}</span>
          <button
            type="button"
            aria-label={t("dismissHint")}
            onClick={() => setShowHint(false)}
            className="grid size-5 shrink-0 place-items-center rounded-full border bg-muted text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        </div>
      )}
      {editable && onSaveLayout && (
        <Button
          size="sm"
          className="absolute right-3 top-3"
          disabled={saving || !!movingId}
          onClick={async () => {
            if (await onSaveLayout(snapshot, layoutVersion)) {
              setBaseVersion(layoutVersion + 1);
              setBaseLayout(snapshot);
            }
          }}
        >
          {t("saveLayout")}
        </Button>
      )}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-xl border bg-card p-1 shadow-sm">
        <Button
          size="icon"
          variant="ghost"
          aria-label={t("zoomOut")}
          disabled={zoom <= 0.2}
          onClick={() => setToolbarZoom(Math.max(0.2, zoom - 0.15))}
        >
          <Minus className="size-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t("zoomIn")}
          disabled={zoom >= 1.6}
          onClick={() => setToolbarZoom(Math.min(1.6, zoom + 0.15))}
        >
          <Plus className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t("fit")}
          onClick={() => {
            const view = viewport.current;
            if (!view) return;
            setToolbarZoom(
              Math.max(0.2, Math.min(1, view.clientWidth / width, view.clientHeight / height)),
            );
            setPan({ x: 0, y: 0 });
            view.scrollTo(0, 0);
          }}
        >
          <Scan className="size-4" />
        </Button>
      </div>
    </div>
  );
}
