"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Users, Crown, X, Layers } from "lucide-react";
import { gsap } from "gsap";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { SeatingChange } from "../api/planning-seating.api";

interface SeatingTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (change: SeatingChange) => Promise<void>;
  saving?: boolean;
  targetCell?: {
    side: "GROOM" | "BRIDE" | "MUTUAL";
    row: number;
    column: number;
  } | null;
  groups?: { id: string; name: string }[];
}

export function SeatingTableModal({
  isOpen,
  onClose,
  onCreate,
  saving = false,
  targetCell = null,
  groups = [],
}: SeatingTableModalProps) {
  const [tab, setTab] = useState<"single" | "batch">(targetCell ? "single" : "single");

  // Single table state
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState<number>(10);
  const [side, setSide] = useState<"GROOM" | "BRIDE" | "MUTUAL" | "">(
    targetCell?.side ?? "",
  );
  const [isVip, setIsVip] = useState(false);
  const [groupId, setGroupId] = useState<string>("");

  // Batch create state
  const [batchCount, setBatchCount] = useState<number>(5);
  const [batchCapacity, setBatchCapacity] = useState<number>(10);
  const [batchGroupId, setBatchGroupId] = useState<string>("");

  const modalRef = useRef<HTMLDivElement>(null);

  const [prevTargetCell, setPrevTargetCell] = useState(targetCell);
  if (targetCell !== prevTargetCell) {
    setPrevTargetCell(targetCell);
    if (targetCell) {
      setSide(targetCell.side);
      setTab("single");
    }
  }

  // GSAP entrance
  useEffect(() => {
    if (!isOpen) return;
    const ctx = gsap.context(() => {
      gsap.from(".table-modal-card", {
        scale: 0.95,
        opacity: 0,
        duration: 0.25,
        ease: "power2.out",
      });
    }, modalRef);
    return () => ctx.revert();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreate({
      action: "CREATE_TABLE",
      name: name.trim() || undefined,
      capacity,
      side: side ? (side as "GROOM" | "BRIDE" | "MUTUAL") : null,
      half:
        targetCell?.side === "BRIDE"
          ? "BRIDE"
          : targetCell?.side === "GROOM"
            ? "GROOM"
            : side === "GROOM" || side === "BRIDE"
              ? side
              : null,
      row: targetCell?.row ?? null,
      column: targetCell?.column ?? null,
      isVip,
      groupId: groupId || null,
    });
    setName("");
    onClose();
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreate({
      action: "CREATE_TABLES",
      tableCount: batchCount,
      capacity: batchCapacity,
      groupId: batchGroupId || null,
    });
    onClose();
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="table-modal-card w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-6 sm:p-8">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground">
                {targetCell
                  ? `Thêm bàn tại ${targetCell.side === "GROOM" ? "Nhà trai" : "Nhà gái"} (Hàng ${targetCell.row}, Cột ${targetCell.column})`
                  : "Thêm Bàn tiệc mới"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Bàn mới tạo sẽ tự động được đánh số thứ tự tiếp theo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tabs switcher (only if not directly clicking a grid slot) */}
        {!targetCell && (
          <div className="flex rounded-xl bg-muted/60 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTab("single")}
              className={`flex-1 rounded-lg py-2 transition-all flex items-center justify-center gap-1.5 ${
                tab === "single"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Plus className="size-3.5" />
              <span>Tạo 1 bàn cụ thể</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("batch")}
              className={`flex-1 rounded-lg py-2 transition-all flex items-center justify-center gap-1.5 ${
                tab === "batch"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="size-3.5" />
              <span>Tạo nhanh nhiều bàn</span>
            </button>
          </div>
        )}

        {/* FORM 1: SINGLE TABLE */}
        {tab === "single" ? (
          <form onSubmit={handleSingleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="font-medium text-muted-foreground uppercase tracking-wider text-[11px]">
                Tên bàn (Tuỳ chọn)
              </label>
              <Input
                placeholder="Ví dụ: Bàn Gia Đình, Bàn VIP 01..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-muted-foreground uppercase tracking-wider text-[11px]">
                  Sức chứa
                </label>
                <select
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm font-semibold"
                >
                  <option value={10}>10 Ghế (Tiêu chuẩn)</option>
                  <option value={12}>12 Ghế (Bàn lớn)</option>
                </select>
              </div>

              <div>
                <label className="font-medium text-muted-foreground uppercase tracking-wider text-[11px]">
                  Phía sảnh tiệc
                </label>
                <select
                  value={side}
                  onChange={(e) =>
                    setSide(e.target.value as "GROOM" | "BRIDE" | "MUTUAL" | "")
                  }
                  className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm"
                >
                  <option value="">Chưa gán (Bàn trong khay)</option>
                  <option value="GROOM">Nhà Trai (Bên trái)</option>
                  <option value="BRIDE">Nhà Gái (Bên phải)</option>
                  <option value="MUTUAL">Bàn Chung (Cả hai họ)</option>
                </select>
              </div>
            </div>

            {groups.length > 0 && (
              <div>
                <label className="font-medium text-muted-foreground uppercase tracking-wider text-[11px]">
                  Nhóm khách gán sẵn
                </label>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm"
                >
                  <option value="">Không gán trước</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <label className="flex items-center gap-2 pt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isVip}
                onChange={(e) => setIsVip(e.target.checked)}
                className="rounded accent-amber-500 size-4"
              />
              <span className="font-medium text-foreground flex items-center gap-1.5">
                <Crown className="size-4 text-amber-500" />
                <span>Đánh dấu là Bàn VIP (Bậc trên &amp; Họ hàng thân thích)</span>
              </span>
            </label>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Hủy
              </Button>
              <Button type="submit" disabled={saving} className="rounded-full px-6 py-5">
                {saving ? "Đang tạo..." : "Xác nhận tạo bàn"}
              </Button>
            </div>
          </form>
        ) : (
          /* FORM 2: BATCH CREATE */
          <form onSubmit={handleBatchSubmit} className="space-y-4 text-xs">
            <div className="rounded-2xl bg-muted/40 p-4 space-y-2">
              <span className="font-medium text-foreground text-sm">Tạo hàng loạt bàn tiệc</span>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Hệ thống sẽ tự động thêm N bàn vào Khay bàn chưa sắp và đánh số thứ tự liên tục. Bạn có thể kéo thả vào sơ đồ bất kỳ lúc nào.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-muted-foreground uppercase tracking-wider text-[11px]">
                  Số lượng bàn (1–50)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={batchCount}
                  onChange={(e) => setBatchCount(Number(e.target.value))}
                  required
                  className="mt-1 text-sm font-semibold"
                />
              </div>

              <div>
                <label className="font-medium text-muted-foreground uppercase tracking-wider text-[11px]">
                  Sức chứa mỗi bàn
                </label>
                <select
                  value={batchCapacity}
                  onChange={(e) => setBatchCapacity(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm font-semibold"
                >
                  <option value={10}>10 Ghế (Phổ biến)</option>
                  <option value={12}>12 Ghế</option>
                </select>
              </div>
            </div>

            {groups.length > 0 && (
              <div>
                <label className="font-medium text-muted-foreground uppercase tracking-wider text-[11px]">
                  Gán cùng một nhóm khách (Tuỳ chọn)
                </label>
                <select
                  value={batchGroupId}
                  onChange={(e) => setBatchGroupId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm"
                >
                  <option value="">Không gán nhóm</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Hủy
              </Button>
              <Button type="submit" disabled={saving} className="rounded-full px-6 py-5">
                {saving ? "Đang tạo..." : `Tạo ngay ${batchCount} bàn`}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
