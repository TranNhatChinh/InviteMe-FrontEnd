"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MousePointer2 } from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import type { SeatingDragPointer, SeatingDragPresence } from "@/core/realtime/seating-drag-events";
import type { SeatingPlan } from "../api/planning-seating.api";
import { seatingDropFeedback } from "../utils/seating-drag-preview";
import { createSeatingCursorAnimator } from "../utils/seating-cursor-animator";
import { SeatingDragPreview } from "./seating-drag-preview";
import { DraggingLabel } from "./seating-drag-presence";

function RemoteCursor({
  weddingId,
  presence,
  plan,
}: {
  weddingId: string;
  presence: SeatingDragPresence;
  plan: SeatingPlan;
}) {
  const node = useRef<HTMLDivElement>(null);
  const { realtime } = useRuntime();
  const [anchorName, setAnchorName] = useState("board");
  useEffect(() => {
    if (!node.current) return;
    const animator = createSeatingCursorAnimator(node.current);
    let latest: SeatingDragPointer | undefined;
    const receive = (pointer: SeatingDragPointer) => {
      if (
        pointer.weddingId !== weddingId ||
        pointer.connectionId !== presence.connectionId ||
        pointer.dragId !== presence.dragId ||
        (latest && latest.sequence >= pointer.sequence)
      )
        return;
      const changedAnchor = latest?.anchor !== pointer.anchor;
      latest = pointer;
      animator.push(pointer);
      // Content only changes when the anchor changes; coordinates never enter React state.
      if (changedAnchor) setAnchorName(pointer.anchor);
    };
    const stop = realtime.onSeatingPointer(receive);
    const initial = realtime.getSeatingPointer(presence.connectionId, presence.dragId);
    if (initial) receive(initial);
    const stopStatus = realtime.subscribe(() => {
      if (realtime.getStatus() !== "connected") {
        latest = undefined;
        animator.reset();
      }
    });
    return () => {
      stop();
      stopStatus();
      animator.dispose();
    };
  }, [realtime, weddingId, presence.connectionId, presence.dragId]);
  const feedback = presence.tableId
    ? seatingDropFeedback(plan, presence.placeIds, {
        tableId: presence.tableId,
        ...(presence.seatNumber ? { seatNumber: presence.seatNumber } : {}),
      })
    : null;
  return (
    <div
      ref={node}
      hidden
      data-testid="seating-remote-drag"
      aria-hidden="true"
      className="group pointer-events-none fixed left-0 top-0 z-[80] select-none"
    >
      <MousePointer2 className="size-5 fill-primary text-primary drop-shadow group-data-[offscreen=true]:invisible" />
      <div className="absolute left-[var(--chip-x)] top-[var(--chip-y)] space-y-1">
        <span className="inline-flex rounded-full border bg-white px-2 py-1 shadow-sm">
          <DraggingLabel presence={presence} />
        </span>
        <p className="hidden rounded bg-white px-2 py-1 text-[10px] text-muted-foreground group-data-[offscreen=true]:block">
          Ngoài vùng đang xem ·{" "}
          {anchorName === "queue"
            ? "Hàng chờ"
            : anchorName === "board"
              ? "Sơ đồ"
              : (plan.tables.find((table) => `table:${table.id}` === anchorName)?.name ?? "Bàn")}
        </p>
        <SeatingDragPreview plan={plan} ids={presence.placeIds} feedback={feedback} />
      </div>
    </div>
  );
}

// Lease snapshots mount/unmount cursors. Each cursor consumes coordinates outside React.
export function SeatingRemoteCursors({
  weddingId,
  leases,
  plan,
}: {
  weddingId: string;
  leases: SeatingDragPresence[];
  plan: SeatingPlan;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    leases.map((lease) => (
      <RemoteCursor key={lease.dragId} weddingId={weddingId} presence={lease} plan={plan} />
    )),
    document.body,
  );
}
