"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useStore } from "zustand";
import { useRuntime } from "@/core/config/runtime";
import {
  seatingDragLeaseSchema,
  seatingDragSnapshotSchema,
  type SeatingDragLease,
} from "@/core/realtime/seating-drag-events";
import { createSeatingCollaborationStore } from "../stores/seating-collaboration";
import type { SeatingDropPosition } from "../utils/seating-drag-preview";
import {
  createLatestPointerSender,
  readSeatingPointer,
  type PointerPoint,
} from "../utils/seating-pointer";

type Operation = {
  ids: string[];
  pending: Promise<SeatingDragLease>;
  cancelled: boolean;
  saving: boolean;
  lease?: SeatingDragLease;
  target?: SeatingDropPosition | null;
};

export function useSeatingCollaboration(
  weddingId: string,
  onAbort: () => void,
  onError: (error?: unknown) => void,
) {
  const { realtime } = useRuntime();
  const store = useMemo(() => createSeatingCollaborationStore(weddingId), [weddingId]);
  const leases = useStore(store, (state) => state.leases);
  const active = useRef<Operation | null>(null);
  const heartbeat = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const lastTarget = useRef<string | undefined>(undefined);
  const pointer = useRef<PointerPoint | undefined>(undefined);
  const sequence = useRef(0);
  const pointerSender = useMemo(
    () =>
      createLatestPointerSender<{
        operation: Operation;
        point: PointerPoint;
        sequence: number;
      }>(async ({ operation, point, sequence: packetSequence }) => {
        if (!operation?.lease || operation.cancelled) return;
        const position = readSeatingPointer(point);
        if (position)
          await realtime.sendSeatingPointer(
            weddingId,
            operation.lease.token,
            position.anchor,
            position.x,
            position.y,
            packetSequence,
            operation.target?.tableId ?? null,
            operation.target?.seatNumber ?? null,
          );
      }),
    [realtime, weddingId],
  );

  const release = useCallback(
    (lease: SeatingDragLease) => {
      void realtime.invokeSeating("EndSeatingDrag", weddingId, lease.token).catch(() => undefined);
    },
    [realtime, weddingId],
  );
  const cancel = useCallback(
    (notify = true, force = false) => {
      const operation = active.current;
      if (operation?.saving && !force) return;
      active.current = null;
      clearInterval(heartbeat.current);
      pointerSender.cancel();
      pointer.current = undefined;
      lastTarget.current = undefined;
      if (operation) {
        operation.cancelled = true;
        if (operation.lease) release(operation.lease);
      }
      if (operation && notify) onAbort();
    },
    [onAbort, release, pointerSender],
  );

  useEffect(() => {
    let disposed = false;
    const load = () => {
      void realtime
        .invokeSeating("GetSeatingDrags", weddingId)
        .then((snapshot) => {
          if (!disposed) store.getState().replace(seatingDragSnapshotSchema.parse(snapshot));
        })
        .catch((error: unknown) => {
          if (!disposed && realtime.getStatus() === "connected") onError(error);
        });
    };
    const stopSnapshots = realtime.onSeatingDrags((snapshot) => {
      store.getState().replace(snapshot);
      for (const lease of snapshot.leases) {
        const pointer = realtime.getSeatingPointer(lease.connectionId, lease.dragId);
        if (pointer) store.getState().updateTarget(pointer);
      }
    });
    const stopPointers = realtime.onSeatingPointer((pointer) =>
      store.getState().updateTarget(pointer),
    );
    const stopResync = realtime.onResync(load);
    const stopStatus = realtime.subscribe(() => {
      if (realtime.getStatus() !== "connected") {
        cancel();
        store.getState().reset();
      }
    });
    if (realtime.getStatus() === "connected") load();
    const onHidden = () => {
      if (document.hidden) cancel();
    };
    const onBlur = () => cancel();
    const onPointerMove = (event: PointerEvent) => {
      if (!active.current || active.current.cancelled || active.current.saving) return;
      pointer.current = { x: event.clientX, y: event.clientY };
      pointerSender.push({
        operation: active.current,
        point: pointer.current,
        sequence: ++sequence.current,
      });
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("pointermove", onPointerMove, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      disposed = true;
      stopSnapshots();
      stopPointers();
      stopResync();
      stopStatus();
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("visibilitychange", onHidden);
      cancel(false, true);
    };
  }, [realtime, weddingId, store, cancel, onError, pointerSender]);

  function begin(ids: string[], initialPointer?: PointerPoint) {
    if (active.current?.saving) return active.current;
    cancel(false);
    pointer.current = initialPointer;
    const operation: Operation = {
      ids: [...ids],
      cancelled: false,
      saving: false,
      pending: realtime
        .invokeSeating("StartSeatingDrag", weddingId, ids)
        .then((value) => seatingDragLeaseSchema.parse(value)),
    };
    active.current = operation;
    void operation.pending
      .then((lease) => {
        operation.lease = lease;
        if (operation.cancelled) {
          release(lease);
          return;
        }
        if (pointer.current)
          pointerSender.push({ operation, point: pointer.current, sequence: ++sequence.current });
        heartbeat.current = setInterval(() => {
          void realtime.invokeSeating("RenewSeatingDrag", weddingId, lease.token).catch((error: unknown) => {
            if (active.current === operation && !operation.saving) {
              cancel();
              onError(error);
            }
          });
        }, 5_000);
      })
      .catch((error: unknown) => {
        if (active.current === operation) {
          cancel();
          onError(error);
        }
      });
    return operation;
  }

  async function run<T>(ids: string[], work: (token: string) => Promise<T>): Promise<T> {
    const current = active.current;
    const operation =
      current &&
      !current.cancelled &&
      ids.length === current.ids.length &&
      ids.every((id) => current.ids.includes(id))
        ? current
        : begin(ids);
    const lease = await operation.pending;
    if (operation.cancelled) throw new Error("SEATING_DRAG_CANCELLED");
    try {
      await realtime.invokeSeating("RenewSeatingDrag", weddingId, lease.token);
      if (operation.cancelled) throw new Error("SEATING_DRAG_CANCELLED");
      operation.saving = true;
      await pointerSender.flush();
      return await work(lease.token);
    } finally {
      operation.saving = false;
      cancel(false);
    }
  }

  function hover(next: SeatingDropPosition | null) {
    const key = JSON.stringify(next);
    if (key === lastTarget.current) return;
    lastTarget.current = key;
    const operation = active.current;
    if (!operation || operation.cancelled || operation.saving) return;
    operation.target = next;
    if (pointer.current) {
      // Target and coordinates share one latest-only packet, including when the
      // pointer stops immediately after entering/leaving a table.
      pointerSender.push({ operation, point: pointer.current, sequence: ++sequence.current });
    } else {
      // Keyboard/tap placement may have no pointer coordinates. Keep its existing
      // acknowledged target command, with no mouse-hover debounce.
      void operation.pending
        .then((lease) => {
          if (!operation.cancelled && !operation.saving && lastTarget.current === key)
            return realtime.invokeSeating(
              "TargetSeatingDrag",
              weddingId,
              lease.token,
              next?.tableId ?? null,
              next?.seatNumber ?? null,
            );
        })
        .catch((error: unknown) => {
          if (active.current === operation) {
            cancel();
            onError(error);
          }
        });
    }
  }
  return { begin, cancel, run, hover, leases, connectionId: realtime.getConnectionId() };
}
