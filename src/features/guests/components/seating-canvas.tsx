"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Minus, Mouse, Plus, Scan, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import type { CanvasLayout, SeatingPlan } from "../api/planning-seating.api";
import type { SeatingTable } from "../utils/seating-layout";

import { seatingObjectIcons, type SeatingCanvasObject } from "./seating-object-palette";

const sides = ["BRIDE", "GROOM"] as const;
function layoutKey(layout: CanvasLayout | null | undefined) {
  return JSON.stringify(layout ?? null, (_key, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  });
}
type ZoneSide = (typeof sides)[number];
type Point = { x: number; y: number };
const spacing = 270;
const top = 202;
const aisleWidth = 128;
const tableWidth = 234;
const frameOutline = 2;
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
      stage: saved.stage,
      ...Object.fromEntries(saved.objects.map(({ id, x, y }) => [id, { x, y }])),
      ...Object.fromEntries(
        sides.flatMap((side) => {
          const zone = saved.zones[side];
          return [
            [`zone:${side}`, { x: zone.x, y: zone.y }],
            [`size:${side}`, { x: zone.width, y: zone.height }],
          ];
        }),
      ),
    };
  });
  const [split, setSplit] = useState(plan.canvasLayout?.splitZones ?? true);
  const [membership, setMembership] = useState<Record<string, ZoneSide | null>>(() =>
    Object.fromEntries(
      Object.entries(plan.canvasLayout?.tables ?? {})
        .filter(([, table]) => table.outsideZone)
        .map(([id]) => [id, null]),
    ),
  );
  const [outside, setOutside] = useState<{ id: string; name: string; point: Point } | null>(null);
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
  const aisleStart = brideWidth * spacing + 14;
  const center = aisleStart + aisleWidth / 2;
  const groomStart = aisleStart + aisleWidth + 18;
  const hallWidth = groomStart + (groomWidth - 1) * spacing + tableWidth + 32;
  const looseTables = plan.tables.filter((table) => !table.side || !table.row || !table.column);
  const lastRow = Math.max(0, ...plan.tables.map((table) => table.row ?? 0));
  const layout = plan.tables.map((table) => {
    const index = looseTables.indexOf(table);
    const row = index < 0 ? (table.row ?? 1) - 1 : lastRow + Math.floor(index / brideWidth);
    const column = index < 0 ? (table.column ?? 1) - 1 : index % brideWidth;
    const initial = {
      x: (table.side === "GROOM" ? groomStart : 32) + column * spacing,
      y: top + row * spacing,
    };
    return { table, point: positions[table.id] ?? initial };
  });
  const stage = positions.stage ?? { x: center - 125, y: 48 };
  const objectLayout = objects.map((object, index) => ({
    ...object,
    point: positions[object.id] ?? {
      x: center - 95 + (index % 2) * 210,
      y: top + lastRow * spacing + Math.floor(index / 2) * 112,
    },
  }));
  const makeZone = (side: ZoneSide, x: number, columns: number) => ({
    id: `zone:${side}`,
    side,
    point: positions[`zone:${side}`] ?? { x, y: 135 },
    size: positions[`size:${side}`] ?? {
      x: columns * spacing,
      y: Math.max(336, 68 + lastRow * spacing),
    },
  });
  const brideZone = makeZone("BRIDE", 14, brideWidth);
  const groomZone = makeZone("GROOM", groomStart - 18, groomWidth);
  const zones = [brideZone, groomZone];
  const assignedZone = (table: SeatingTable) =>
    membership[table.id] === undefined ? table.side : membership[table.id];
  const zoneAt = (point: Point, preferred?: ZoneSide | null) => {
    const hits = zones.filter(
      (zone) =>
        point.x - frameOutline >= zone.point.x &&
        point.x + tableWidth + frameOutline <= zone.point.x + zone.size.x &&
        point.y - frameOutline >= zone.point.y &&
        point.y + tableWidth + frameOutline <= zone.point.y + zone.size.y,
    );
    return hits.find((zone) => zone.side === preferred) ?? hits.at(-1);
  };
  const [baseVersion, setBaseVersion] = useState(plan.version);
  const [baseLayout, setBaseLayout] = useState(plan.canvasLayout);
  const snapshot: CanvasLayout = {
    splitZones: split,
    tables: Object.fromEntries(
      layout.map(({ table, point }) => {
        const side = membership[table.id];
        return [
          table.id,
          {
            ...point,
            ...(side === null
              ? { outsideZone: true }
              : side && side !== table.side
                ? { side }
                : {}),
          },
        ];
      }),
    ),
    zones: {
      BRIDE: { ...brideZone.point, width: brideZone.size.x, height: brideZone.size.y },
      GROOM: { ...groomZone.point, width: groomZone.size.x, height: groomZone.size.y },
    },
    stage,
    objects: objectLayout.map(({ id, kind, point }) => ({ id, type: kind, ...point })),
  };
  useEffect(() => {
    onCaptureLayout?.(snapshot);
  });

  const layoutVersion =
    layoutKey(baseLayout) === layoutKey(plan.canvasLayout) ? plan.version : baseVersion;
  const movingTable = layout.find(({ table }) => table.id === movingId);
  const destination = movingTable && zoneAt(movingTable.point, assignedZone(movingTable.table));
  const points = [...layout, ...objectLayout].map(({ point }) => point);
  const padding = 32;
  const left = Math.min(
    0,
    stage.x - padding,
    ...points.map((point) => point.x - padding),
    ...zones.map((zone) => zone.point.x - padding),
  );
  const upper = Math.min(
    0,
    stage.y - padding,
    ...points.map((point) => point.y - padding),
    ...zones.map((zone) => zone.point.y - padding),
  );
  const width =
    Math.max(
      hallWidth,
      stage.x + 250 + padding,
      ...points.map((point) => point.x + spacing),
      ...zones.map((zone) => zone.point.x + zone.size.x + padding),
    ) - left;
  const height =
    Math.max(
      480,
      stage.y + 64 + padding,
      ...points.map((point) => point.y + spacing),
      ...zones.map((zone) => zone.point.y + zone.size.y + padding),
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
    const zone = zones.find((item) => item.id === id);
    if (zone) {
      const dx = point.x - zone.point.x;
      const dy = point.y - zone.point.y;
      const tables = layout.filter(({ table }) => assignedZone(table) === zone.side);
      setPositions((current) => ({
        ...current,
        [id]: point,
        ...Object.fromEntries(
          tables.map(({ table, point }) => [table.id, { x: point.x + dx, y: point.y + dy }]),
        ),
      }));
      return;
    }
    const resized = zones.find((item) => id.startsWith(`resize:${item.side}:`));
    const corner = resizeCorners.find((item) => id.endsWith(`:${item.key}`));
    if (resized && corner) {
      const members = layout.filter(({ table }) => assignedZone(table) === resized.side);
      const startX = resized.point.x;
      const startY = resized.point.y;
      const endX = startX + resized.size.x;
      const endY = startY + resized.size.y;
      const leftEdge = corner.west
        ? Math.min(point.x, endX - 160, ...members.map(({ point }) => point.x - frameOutline))
        : startX;
      const topEdge = corner.north
        ? Math.min(point.y, endY - 160, ...members.map(({ point }) => point.y - frameOutline))
        : startY;
      const rightEdge = corner.west
        ? endX
        : Math.max(
            point.x,
            startX + 160,
            ...members.map(({ point }) => point.x + tableWidth + frameOutline),
          );
      const bottomEdge = corner.north
        ? endY
        : Math.max(
            point.y,
            startY + 160,
            ...members.map(({ point }) => point.y + tableWidth + frameOutline),
          );
      setPositions((current) => ({
        ...current,
        [resized.id]: { x: leftEdge, y: topEdge },
        [`size:${resized.side}`]: { x: rightEdge - leftEdge, y: bottomEdge - topEdge },
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
    if (!id.startsWith("resize:")) setSelectedId(id);
    setOutside(null);
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
    const table = layout.find((item) => item.table.id === id)?.table;
    if (split && table) {
      const zone = zoneAt(next, assignedZone(table));
      if (!zone) {
        setOutside({ id, name: table.name, point: next });
        return;
      }
      setOutside(null);
      setMembership((current) => ({ ...current, [id]: zone.side }));
    }
    place(id, next);
  }

  function zoneDragTarget(element: HTMLElement) {
    const zone = zones.find(({ id }) => id === element.dataset.zone);
    if (!zone) return;
    const corner = resizeCorners.find(({ key }) => key === element.dataset.corner);
    if (!corner) return { id: zone.id, point: zone.point };
    return {
      id: `resize:${zone.side}:${corner.key}`,
      point: {
        x: zone.point.x + (corner.west ? 0 : zone.size.x),
        y: zone.point.y + (corner.north ? 0 : zone.size.y),
      },
    };
  }

  function startZone(event: PointerEvent<HTMLDivElement>) {
    const target = zoneDragTarget(event.currentTarget);
    if (target) start(event, target.id, target.point);
  }

  function moveZoneWithKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = zoneDragTarget(event.currentTarget);
    if (target) moveWithKey(event, target.id, target.point);
  }

  function leave(id: string) {
    if (drag.current?.id === id && !drag.current.moved) drag.current = null;
  }

  function finish(event: PointerEvent<HTMLElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.moved && split && movingTable?.table.id === active.id) {
      if (event.type !== "pointerup" || !destination) {
        place(active.id, active.original);
        if (event.type === "pointerup")
          setOutside({ id: active.id, name: movingTable.table.name, point: movingTable.point });
      } else {
        setMembership((current) => ({ ...current, [active.id]: destination.side }));
      }
    }
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

  return (
    <div
      className="relative overflow-hidden bg-[#faf9f7]"
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
        className={`h-[min(68dvh,850px)] min-h-80 overflow-auto overscroll-contain ${panning ? "cursor-grabbing select-none" : ""}`}
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
            {split &&
              zones.map(({ id, side, point, size }) => {
                const label = t(side === "BRIDE" ? "brideArea" : "groomArea");
                return (
                  <div
                    key={id}
                    data-canvas-selection
                    onClick={() => {
                      if (editable) setSelectedId(id);
                    }}
                    className={`group/zone absolute rounded-xl border-2 ${destination?.side === side ? "border-emerald-500 bg-emerald-100/40" : movingTable && !destination ? "border-amber-400 bg-amber-100/20" : selectedId === id ? "border-sky-400 bg-white/30" : "border-stone-300/80 bg-white/30"}`}
                    style={{
                      left: point.x - left,
                      top: point.y - upper,
                      width: size.x,
                      height: size.y,
                    }}
                  >
                    <div
                      tabIndex={editable ? 0 : undefined}
                      role="group"
                      aria-label={t("move", { name: label })}
                      className={`absolute left-3 top-3 rounded-md bg-white px-3 py-1 text-sm font-semibold shadow-sm ${editable ? "pointer-events-auto cursor-grab touch-none select-none" : ""}`}
                      data-zone={id}
                      onPointerDown={startZone}
                      onPointerMove={move}
                      onPointerUp={finish}
                      onPointerCancel={finish}
                      onLostPointerCapture={finish}
                      onPointerLeave={() => leave(`zone:${side}`)}
                      onKeyDown={moveZoneWithKey}
                    >
                      {label}
                    </div>
                    {editable &&
                      selectedId === id &&
                      resizeCorners.map((corner) => {
                        const resizeId = `resize:${side}:${corner.key}`;
                        return (
                          <div
                            key={corner.key}
                            tabIndex={0}
                            role="group"
                            aria-label={t("resizeZone", { name: label })}
                            className={`absolute z-20 size-4 touch-none rounded-full border-2 border-white bg-sky-500 focus-visible:ring-2 focus-visible:ring-sky-500 ${corner.classes}`}
                            data-zone={id}
                            data-corner={corner.key}
                            onPointerDown={startZone}
                            onPointerMove={move}
                            onPointerUp={finish}
                            onPointerCancel={finish}
                            onLostPointerCapture={finish}
                            onPointerLeave={() => leave(resizeId)}
                            onKeyDown={moveZoneWithKey}
                          />
                        );
                      })}
                  </div>
                );
              })}
            {split &&
              brideZone.point.x === 14 &&
              groomZone.point.x === groomStart - 18 &&
              brideZone.point.y === 135 &&
              groomZone.point.y === 135 &&
              brideZone.size.x === brideWidth * spacing &&
              groomZone.size.x === groomWidth * spacing &&
              brideZone.size.y === groomZone.size.y && (
                <div
                  className="pointer-events-none absolute flex justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-200/45 pt-3 text-xs font-medium text-stone-600"
                  style={{
                    left: aisleStart - left,
                    top: 130 - upper,
                    width: aisleWidth,
                    height: brideZone.size.y,
                  }}
                >
                  {t("centerAisle")}
                </div>
              )}
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
              className={`absolute grid h-16 w-[250px] place-items-center rounded-xl border border-rose-200 bg-rose-50 text-sm font-semibold text-rose-900 ${frameClass("stage")}`}
              style={{ left: stage.x - left, top: stage.y - upper }}
            >
              {t("stage")}
              {selectionDots("stage")}
            </div>
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
                  className={`absolute flex h-20 w-[190px] items-center justify-center gap-2 rounded-xl border border-stone-300 bg-stone-100 text-sm font-medium text-stone-800 ${frameClass(id)}`}
                  style={{ left: point.x - left, top: point.y - upper }}
                >
                  <Icon className="size-5" />
                  {t(kind)}
                  {selectionDots(id)}
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
                {selectionDots(table.id)}
                {split && membership[table.id] === null && (
                  <span className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">
                    {t("outsideZones")}
                  </span>
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
      <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 text-xs shadow-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={split}
            onChange={(event) => {
              setSplit(event.target.checked);
              setOutside(null);
            }}
          />
          {t("splitZones")}
        </label>
        {split && editable && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const [bride, groom] = zones;
              if (!bride || !groom) return;
              setOutside(null);
              setPositions((current) => ({
                ...current,
                [bride.id]: groom.point,
                [groom.id]: bride.point,
                ...Object.fromEntries(
                  layout.flatMap(({ table, point }) => {
                    const side = assignedZone(table);
                    if (!side) return [];
                    const from = side === "BRIDE" ? bride : groom;
                    const to = side === "BRIDE" ? groom : bride;
                    return [
                      [
                        table.id,
                        {
                          x: point.x + to.point.x - from.point.x,
                          y: point.y + to.point.y - from.point.y,
                        },
                      ],
                    ];
                  }),
                ),
              }));
            }}
          >
            {t("swapZones")}
          </Button>
        )}
      </div>
      {editable && onSaveLayout && (
        <Button
          size="sm"
          className="absolute right-3 top-3"
          disabled={saving || !!movingId}
          onClick={async () => {
            if (await onSaveLayout(snapshot, layoutVersion)) {
              setBaseVersion(layoutVersion + 1);
              setBaseLayout({
                ...snapshot,
                tables: Object.fromEntries(
                  Object.entries(snapshot.tables).map(([id, table]) => [
                    id,
                    { x: table.x, y: table.y, outsideZone: table.outsideZone ?? false, side: null },
                  ]),
                ),
              });
              setMembership((current) =>
                Object.fromEntries(Object.entries(current).filter(([, side]) => side === null)),
              );
            }
          }}
        >
          {t("saveLayout")}
        </Button>
      )}
      {split && movingTable && (
        <p
          role="status"
          className="pointer-events-none absolute bottom-16 left-3 rounded-lg border bg-card px-3 py-2 text-sm"
        >
          {destination
            ? t("dropInZone", { name: t(destination.side === "BRIDE" ? "brideArea" : "groomArea") })
            : t("outsideZones")}
        </p>
      )}
      {split && editable && outside && (
        <div
          role="status"
          className="absolute bottom-16 left-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-card px-3 py-2 text-sm"
        >
          {outside.name} · {t("outsideZones")}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              place(outside.id, outside.point);
              setMembership((current) => ({ ...current, [outside.id]: null }));
              setOutside(null);
            }}
          >
            {t("placeOutside")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t("closePalette")}
            onClick={() => setOutside(null)}
          >
            <X className="size-4" />
          </Button>
        </div>
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
