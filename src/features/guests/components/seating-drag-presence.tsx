"use client";

import { createContext, useContext } from "react";
import type { SeatingDragPresence } from "@/core/realtime/seating-drag-events";
import { Avatar } from "@/shared/ui/avatar";

export const SeatingDragPresenceContext = createContext<SeatingDragPresence[]>([]);

export function useSeatingDragLock(ids: string[]) {
  return useContext(SeatingDragPresenceContext).find((lease) =>
    ids.some((id) => lease.placeIds.includes(id)),
  );
}

export function DraggingLabel({ presence }: { presence: SeatingDragPresence }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 text-[11px] text-muted-foreground"
      title={`Đang được xử lí bởi ${presence.displayName}`}
    >
      <Avatar name={presence.displayName} className="size-5 text-[9px]" />
      <span className="truncate">Đang được xử lí bởi {presence.displayName}</span>
    </span>
  );
}
