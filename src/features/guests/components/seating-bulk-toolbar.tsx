"use client";

import { useEffect, useRef } from "react";
import { Crown, X } from "lucide-react";
import { gsap } from "gsap";
import { Button } from "@/shared/ui/button";

interface SeatingBulkToolbarProps {
  selectedCount: number;
  onClear: () => void;
  onAssignSide: (side: "GROOM" | "BRIDE" | "MUTUAL") => void;
  onToggleVip: (isVip: boolean) => void;
  onAssignGroup: (groupId: string | null) => void;
  groups?: { id: string; name: string }[];
  saving?: boolean;
}

export function SeatingBulkToolbar({
  selectedCount,
  onClear,
  onAssignSide,
  onToggleVip,
  onAssignGroup,
  groups = [],
  saving = false,
}: SeatingBulkToolbarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedCount > 0) {
      const ctx = gsap.context(() => {
        gsap.fromTo(
          barRef.current,
          { y: 60, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.35, ease: "back.out(1.5)" },
        );
      }, barRef);
      return () => ctx.revert();
    }
  }, [selectedCount]);

  if (selectedCount === 0) return null;

  return (
    <div
      ref={barRef}
      className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 flex items-center gap-3 rounded-full border border-primary/30 bg-card/95 px-5 py-3 shadow-2xl backdrop-blur-md"
      role="toolbar"
      aria-label="Thao tác hàng loạt bàn tiệc"
    >
      <div className="flex items-center gap-2 border-r border-border pr-3">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {selectedCount}
        </span>
        <span className="text-xs font-medium text-foreground whitespace-nowrap">
          bàn đã chọn
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Assign Side */}
        <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
          <button
            type="button"
            onClick={() => onAssignSide("GROOM")}
            disabled={saving}
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
          >
            Nhà Trai
          </button>
          <button
            type="button"
            onClick={() => onAssignSide("BRIDE")}
            disabled={saving}
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-900/40"
          >
            Nhà Gái
          </button>
          <button
            type="button"
            onClick={() => onAssignSide("MUTUAL")}
            disabled={saving}
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
          >
            Chung
          </button>
        </div>

        {/* Toggle VIP */}
        <Button
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => onToggleVip(true)}
          className="h-8 rounded-full text-xs gap-1.5 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
        >
          <Crown className="size-3.5" />
          <span>Gán VIP</span>
        </Button>

        {/* Assign Group */}
        {groups.length > 0 && (
          <select
            onChange={(e) => onAssignGroup(e.target.value || null)}
            defaultValue=""
            disabled={saving}
            className="h-8 rounded-full border border-input bg-background px-3 text-xs text-foreground focus:ring-1 focus:ring-primary"
          >
            <option value="" disabled>
              Gán Nhóm khách...
            </option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <button
        type="button"
        onClick={onClear}
        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted ml-1 transition-colors"
        title="Bỏ chọn"
        aria-label="Bỏ chọn"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
