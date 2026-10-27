"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Grid, X } from "lucide-react";
import { gsap } from "gsap";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { SeatingLayout } from "../api/planning-seating.api";

interface SeatingLayoutModalProps {
  layout?: SeatingLayout | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    groomRows: number;
    groomColumns: number;
    brideRows: number;
    brideColumns: number;
    numbering: "BY_ROW" | "ODD_EVEN";
  }) => Promise<void>;
  saving?: boolean;
  saveError?: string | null;
}

export function SeatingLayoutModal({
  layout,
  isOpen,
  onClose,
  onSave,
  saving = false,
  saveError = null,
}: SeatingLayoutModalProps) {
  const [groomRows, setGroomRows] = useState(layout?.groomRows ?? 6);
  const [groomColumns, setGroomColumns] = useState(layout?.groomColumns ?? 3);
  const [brideRows, setBrideRows] = useState(layout?.brideRows ?? 6);
  const [brideColumns, setBrideColumns] = useState(layout?.brideColumns ?? 3);
  const [numbering, setNumbering] = useState<"BY_ROW" | "ODD_EVEN">(
    layout?.numbering ?? "BY_ROW",
  );

  const [prevLayout, setPrevLayout] = useState(layout);
  if (layout !== prevLayout) {
    setPrevLayout(layout);
    if (layout) {
      setGroomRows(layout.groomRows);
      setGroomColumns(layout.groomColumns);
      setBrideRows(layout.brideRows);
      setBrideColumns(layout.brideColumns);
      setNumbering(layout.numbering);
    }
  }

  const modalRef = useRef<HTMLDivElement>(null);

  // GSAP entrance
  useEffect(() => {
    if (!isOpen) return;
    const ctx = gsap.context(() => {
      gsap.from(".layout-modal-card", {
        scale: 0.95,
        opacity: 0,
        duration: 0.25,
        ease: "power2.out",
      });
    }, modalRef);
    return () => ctx.revert();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      groomRows: Number(groomRows),
      groomColumns: Number(groomColumns),
      brideRows: Number(brideRows),
      brideColumns: Number(brideColumns),
      numbering,
    });
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="layout-modal-title"
    >
      <div className="layout-modal-card w-full max-w-2xl rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Grid className="size-5" />
            </div>
            <div>
              <h2
                id="layout-modal-title"
                className="font-serif text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
              >
                Thiết lập Sơ đồ Sảnh cưới
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cấu hình số hàng, cột và cách đánh số bàn theo mặt bằng sảnh tiệc.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        {saveError && (
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Không thể lưu sơ đồ sảnh</div>
              <p className="mt-0.5 opacity-90">{saveError}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Grid Dimensions */}
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Groom side */}
            <div className="rounded-2xl border border-blue-500/20 bg-blue-50/50 p-4 dark:bg-blue-950/20 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-serif font-semibold text-sm text-blue-900 dark:text-blue-300">
                  Phía Nhà Trai (Bên Trái)
                </span>
                <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                  Nhà trai
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-medium text-muted-foreground">Số hàng (1–20)</label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={groomRows}
                    onChange={(e) => setGroomRows(Number(e.target.value))}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="font-medium text-muted-foreground">Số cột (1–6)</label>
                  <Input
                    type="number"
                    min={1}
                    max={6}
                    value={groomColumns}
                    onChange={(e) => setGroomColumns(Number(e.target.value))}
                    required
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Bride side */}
            <div className="rounded-2xl border border-rose-500/20 bg-rose-50/50 p-4 dark:bg-rose-950/20 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-serif font-semibold text-sm text-rose-900 dark:text-rose-300">
                  Phía Nhà Gái (Bên Phải)
                </span>
                <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                  Nhà gái
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-medium text-muted-foreground">Số hàng (1–20)</label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={brideRows}
                    onChange={(e) => setBrideRows(Number(e.target.value))}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="font-medium text-muted-foreground">Số cột (1–6)</label>
                  <Input
                    type="number"
                    min={1}
                    max={6}
                    value={brideColumns}
                    onChange={(e) => setBrideColumns(Number(e.target.value))}
                    required
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Numbering strategy */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Quy tắc Đánh số bàn
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label
                className={`relative flex cursor-pointer flex-col justify-between rounded-2xl border p-4 transition-all ${
                  numbering === "BY_ROW"
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="font-semibold text-sm text-foreground">
                      Theo hàng (Mặc định)
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Đánh số tăng dần theo từng hàng từ lối đi ra ngoài (Bàn 01, 02, 03...).
                    </p>
                  </div>
                  <input
                    type="radio"
                    name="numbering"
                    value="BY_ROW"
                    checked={numbering === "BY_ROW"}
                    onChange={() => setNumbering("BY_ROW")}
                    className="mt-1 accent-primary"
                  />
                </div>
              </label>

              <label
                className={`relative flex cursor-pointer flex-col justify-between rounded-2xl border p-4 transition-all ${
                  numbering === "ODD_EVEN"
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="font-semibold text-sm text-foreground">
                      Trai số Lẻ – Gái số Chẵn
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Nhà trai số 01, 03, 05... Nhà gái số 02, 04, 06...
                    </p>
                  </div>
                  <input
                    type="radio"
                    name="numbering"
                    value="ODD_EVEN"
                    checked={numbering === "ODD_EVEN"}
                    onChange={() => setNumbering("ODD_EVEN")}
                    className="mt-1 accent-primary"
                  />
                </div>
              </label>
            </div>
          </div>

          {/* Mini schematic preview */}
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="text-center font-serif text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-widest pb-2 border-b border-border/40">
              [ SÂN KHẤU CHÍNH ]
            </div>
            <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
              <div className="text-center">
                <span className="font-semibold text-blue-600 dark:text-blue-400">Nhà Trai</span>
                <div>
                  {groomRows} hàng × {groomColumns} cột
                </div>
              </div>
              <div className="h-8 w-px bg-primary/30" />
              <div className="text-center font-mono font-medium text-primary">LỐI ĐI HOA</div>
              <div className="h-8 w-px bg-primary/30" />
              <div className="text-center">
                <span className="font-semibold text-rose-600 dark:text-rose-400">Nhà Gái</span>
                <div>
                  {brideRows} hàng × {brideColumns} cột
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-full px-6 py-5 font-semibold gap-2 shadow-md"
            >
              <Check className="size-4" />
              <span>{saving ? "Đang lưu thiết lập..." : "Lưu Sơ đồ Sảnh"}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
