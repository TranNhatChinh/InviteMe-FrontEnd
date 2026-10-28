"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Sparkles, Wand2, X } from "lucide-react";
import { gsap } from "gsap";
import { useRuntime } from "@/core/config/runtime";
import { Button } from "@/shared/ui/button";
import {
  suggestSeatingPlan,
  applySeatingSuggestion,
  type SeatingPlan,
  type SeatingStrategy,
  type SuggestionMode,
  type SeatingSuggestion,
} from "../api/planning-seating.api";

interface SeatingSuggestionsModalProps {
  plan: SeatingPlan;
  isOpen: boolean;
  onClose: () => void;
  onApplied: () => void;
}

export function SeatingSuggestionsModal({
  plan,
  isOpen,
  onClose,
  onApplied,
}: SeatingSuggestionsModalProps) {
  const { api } = useRuntime();
  const [selectedStrategy, setSelectedStrategy] = useState<SeatingStrategy>("AFFINITY");
  const [mode, setMode] = useState<SuggestionMode>("UNASSIGNED");
  const [confirmReplace, setConfirmReplace] = useState(false);

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store suggestions for each of the 3 strategies
  const [suggestions, setSuggestions] = useState<Record<string, SeatingSuggestion | null>>({
    AFFINITY: null,
    COMPACT: null,
    PARTY: null,
  });

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ignore = false;
    if (!isOpen) return;

    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      void Promise.all([
        suggestSeatingPlan(api, plan.weddingId, "AFFINITY", mode),
        suggestSeatingPlan(api, plan.weddingId, "COMPACT", mode),
        suggestSeatingPlan(api, plan.weddingId, "PARTY", mode),
      ])
        .then(([affinityRes, compactRes, partyRes]) => {
          if (!ignore) {
            setSuggestions({
              AFFINITY: affinityRes,
              COMPACT: compactRes,
              PARTY: partyRes,
            });
          }
        })
        .catch((err: unknown) => {
          if (!ignore) {
            const msg =
              err instanceof Error ? err.message : "Không thể tính toán phương án xếp bàn.";
            setError(msg);
          }
        })
        .finally(() => {
          if (!ignore) {
            setLoading(false);
          }
        });
    }, 0);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [api, isOpen, mode, plan.weddingId]);

  // GSAP animation
  useEffect(() => {
    if (!isOpen) return;
    const ctx = gsap.context(() => {
      gsap.from(".suggestion-card", {
        y: 20,
        opacity: 0,
        duration: 0.35,
        stagger: 0.08,
        ease: "power2.out",
      });
    }, modalRef);
    return () => ctx.revert();
  }, [isOpen, loading]);

  if (!isOpen) return null;

  const currentSuggestion = suggestions[selectedStrategy];

  const handleApply = async () => {
    if (!currentSuggestion) return;
    if (mode === "REPLACE_ALL" && !confirmReplace) {
      setError("Vui lòng xác nhận thay thế sơ đồ trước khi xếp lại toàn bộ.");
      return;
    }

    setApplying(true);
    setError(null);
    try {
      await applySeatingSuggestion(api, plan.weddingId, {
        expectedVersion: plan.version,
        strategy: selectedStrategy,
        mode,
        sourceFingerprint: currentSuggestion.sourceFingerprint,
        confirmReplace: mode === "REPLACE_ALL" ? confirmReplace : false,
      });
      onApplied();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể áp dụng phương án xếp chỗ.";
      setError(msg);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-4xl rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Wand2 className="size-5" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                Gợi ý Xếp chỗ Tự động
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Áp dụng phong tục cưới Việt: hai họ hai bên, bậc trên gần sân khấu, người cùng nhóm ngồi cùng bàn.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-muted/40 p-3">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Chế độ xếp chỗ:
          </span>
          <div className="flex rounded-xl bg-card p-1 text-xs border border-border shadow-sm">
            <button
              type="button"
              onClick={() => setMode("UNASSIGNED")}
              className={`rounded-lg px-4 py-2 font-medium transition-all ${
                mode === "UNASSIGNED"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Chỉ xếp người chưa có chỗ (Khuyên dùng)
            </button>
            <button
              type="button"
              onClick={() => setMode("REPLACE_ALL")}
              className={`rounded-lg px-4 py-2 font-medium transition-all ${
                mode === "REPLACE_ALL"
                  ? "bg-destructive text-destructive-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Xếp lại toàn bộ
            </button>
          </div>
        </div>

        {mode === "REPLACE_ALL" && (
          <label className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive cursor-pointer">
            <input
              type="checkbox"
              checked={confirmReplace}
              onChange={(e) => setConfirmReplace(e.target.checked)}
              className="rounded accent-destructive size-4"
            />
            <span className="font-medium">
              Tôi xác nhận muốn xóa các vị trí đã xếp tay hiện tại và xếp lại toàn bộ sơ đồ.
            </span>
          </label>
        )}

        {error && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 3 Strategy Cards */}
        {loading ? (
          <div className="flex h-56 flex-col items-center justify-center space-y-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">
              Đang tính toán tối ưu 3 phương án theo phong tục cưới...
            </span>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {/* Strategy 1: AFFINITY */}
            <div
              onClick={() => setSelectedStrategy("AFFINITY")}
              className={`suggestion-card relative flex flex-col justify-between rounded-2xl border p-5 transition-all cursor-pointer ${
                selectedStrategy === "AFFINITY"
                  ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary"
                  : "border-border hover:border-primary/40 hover:bg-muted/20"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                    Khuyên dùng
                  </span>
                  <div className="font-serif text-lg font-bold text-foreground">Giữ nhóm</div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ưu tiên tối đa người cùng nhóm / họ hàng ngồi cùng bàn, bậc trên ở bàn VIP gần sân khấu.
                </p>

                {suggestions.AFFINITY && (
                  <div className="space-y-1.5 pt-2 border-t border-border/50 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Số chỗ xếp được:</span>
                      <span className="font-semibold text-foreground">
                        {suggestions.AFFINITY.assignments.length} chỗ
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Chỗ được giữ nguyên:</span>
                      <span className="font-semibold text-emerald-600">
                        {suggestions.AFFINITY.preservedCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Số cảnh báo:</span>
                      <span className="font-semibold text-amber-600">
                        {suggestions.AFFINITY.warnings.length}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs">
                <span className="font-semibold text-primary">
                  {selectedStrategy === "AFFINITY" ? "Đang chọn" : "Chọn phương án này"}
                </span>
                {selectedStrategy === "AFFINITY" && <Check className="size-4 text-primary" />}
              </div>
            </div>

            {/* Strategy 2: COMPACT */}
            <div
              onClick={() => setSelectedStrategy("COMPACT")}
              className={`suggestion-card relative flex flex-col justify-between rounded-2xl border p-5 transition-all cursor-pointer ${
                selectedStrategy === "COMPACT"
                  ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary"
                  : "border-border hover:border-primary/40 hover:bg-muted/20"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                    Tiết kiệm
                  </span>
                  <div className="font-serif text-lg font-bold text-foreground">Ít bàn nhất</div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Tối ưu lấp đầy các bàn, ghép các nhóm nhỏ cùng phía để sử dụng ít bàn tiệc nhất.
                </p>

                {suggestions.COMPACT && (
                  <div className="space-y-1.5 pt-2 border-t border-border/50 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Số chỗ xếp được:</span>
                      <span className="font-semibold text-foreground">
                        {suggestions.COMPACT.assignments.length} chỗ
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Chỗ được giữ nguyên:</span>
                      <span className="font-semibold text-emerald-600">
                        {suggestions.COMPACT.preservedCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Số cảnh báo:</span>
                      <span className="font-semibold text-amber-600">
                        {suggestions.COMPACT.warnings.length}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs">
                <span className="font-semibold text-primary">
                  {selectedStrategy === "COMPACT" ? "Đang chọn" : "Chọn phương án này"}
                </span>
                {selectedStrategy === "COMPACT" && <Check className="size-4 text-primary" />}
              </div>
            </div>

            {/* Strategy 3: PARTY */}
            <div
              onClick={() => setSelectedStrategy("PARTY")}
              className={`suggestion-card relative flex flex-col justify-between rounded-2xl border p-5 transition-all cursor-pointer ${
                selectedStrategy === "PARTY"
                  ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary"
                  : "border-border hover:border-primary/40 hover:bg-muted/20"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                    Liền mạch
                  </span>
                  <div className="font-serif text-lg font-bold text-foreground">Đơn giản</div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Giữ trọn vẹn gia đình / người cùng thiệp ngồi liền nhau, tuyệt đối không tách thiệp.
                </p>

                {suggestions.PARTY && (
                  <div className="space-y-1.5 pt-2 border-t border-border/50 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Số chỗ xếp được:</span>
                      <span className="font-semibold text-foreground">
                        {suggestions.PARTY.assignments.length} chỗ
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Chỗ được giữ nguyên:</span>
                      <span className="font-semibold text-emerald-600">
                        {suggestions.PARTY.preservedCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Số cảnh báo:</span>
                      <span className="font-semibold text-amber-600">
                        {suggestions.PARTY.warnings.length}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs">
                <span className="font-semibold text-primary">
                  {selectedStrategy === "PARTY" ? "Đang chọn" : "Chọn phương án này"}
                </span>
                {selectedStrategy === "PARTY" && <Check className="size-4 text-primary" />}
              </div>
            </div>
          </div>
        )}

        {/* Details & Warnings of chosen strategy */}
        {currentSuggestion && (
          <div className="space-y-3">
            {/* Additional table shortage advice from backend */}
            {currentSuggestion.suggestedAdditionalTables &&
              currentSuggestion.suggestedAdditionalTables.length > 0 && (
                <div className="rounded-2xl border border-blue-500/30 bg-blue-50/60 dark:bg-blue-950/20 p-4 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-serif font-semibold text-blue-950 dark:text-blue-200">
                    <Sparkles className="size-4 text-blue-600 dark:text-blue-400" />
                    <span>Gợi ý kê thêm bàn cho sảnh tiệc:</span>
                  </div>
                  <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                    {currentSuggestion.suggestedAdditionalTables.map((s, idx) => (
                      <li key={idx} className="text-foreground">
                        {s.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3 text-xs">
              <div className="font-serif font-semibold text-foreground">
                Chi tiết phân bổ của phương án{" "}
                {selectedStrategy === "AFFINITY" || selectedStrategy === "KEEP_GROUPS"
                  ? "Giữ nhóm"
                  : selectedStrategy === "COMPACT" || selectedStrategy === "FEWEST_TABLES"
                    ? "Ít bàn nhất"
                    : "Đơn giản"}
                :
              </div>

              {currentSuggestion.scoreBreakdown && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-b border-border/40 pb-3 text-[11px]">
                  <div className="bg-card p-2 rounded-xl border border-border text-center shadow-xs">
                    <div className="text-muted-foreground text-[10px]">Cùng nhóm ngồi chung</div>
                    <div className="font-semibold text-foreground">
                      {currentSuggestion.scoreBreakdown.sameGroupMatchesCount} cặp
                    </div>
                  </div>
                  <div className="bg-card p-2 rounded-xl border border-border text-center shadow-xs">
                    <div className="text-muted-foreground text-[10px]">Bậc trên ở bàn VIP</div>
                    <div className="font-semibold text-emerald-600">
                      {currentSuggestion.scoreBreakdown.eldersInVipCount} người
                    </div>
                  </div>
                  <div className="bg-card p-2 rounded-xl border border-border text-center shadow-xs">
                    <div className="text-muted-foreground text-[10px]">Số bàn sử dụng</div>
                    <div className="font-semibold text-foreground">
                      {currentSuggestion.scoreBreakdown.usedTablesCount} bàn
                    </div>
                  </div>
                  <div className="bg-card p-2 rounded-xl border border-border text-center shadow-xs">
                    <div className="text-muted-foreground text-[10px]">Nhóm bị tách</div>
                    <div className="font-semibold text-amber-600">
                      {currentSuggestion.scoreBreakdown.splitPartiesCount} nhóm
                    </div>
                  </div>
                  {/* Both families at one table is allowed; shown so the couple can review it. */}
                  {(currentSuggestion.scoreBreakdown.mixedSideTablesCount ?? 0) > 0 && (
                    <div className="col-span-2 sm:col-span-4 bg-card p-2 rounded-xl border border-border text-center shadow-xs">
                      <div className="text-muted-foreground text-[10px]">Bàn có khách cả hai họ</div>
                      <div className="font-semibold text-foreground">
                        {currentSuggestion.scoreBreakdown.mixedSideTablesCount} bàn
                      </div>
                    </div>
                  )}
                </div>
              )}

              {currentSuggestion.unassigned.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200">
                  <div className="font-semibold">
                    Còn {currentSuggestion.unassigned.length} nhóm chưa xếp được đủ chỗ:
                  </div>
                  <ul className="mt-1 list-disc list-inside space-y-0.5 text-[11px]">
                    {currentSuggestion.unassigned.slice(0, 5).map((u, i) => (
                      <li key={i}>{u.message}</li>
                    ))}
                    {currentSuggestion.unassigned.length > 5 && (
                      <li>...và {currentSuggestion.unassigned.length - 5} nhóm khác.</li>
                    )}
                  </ul>
                </div>
              )}

              {currentSuggestion.warnings.length > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Cảnh báo: </span>
                  {currentSuggestion.warnings.join(" · ")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={applying}>
            Hủy
          </Button>
          <Button
            onClick={handleApply}
            disabled={loading || applying || !currentSuggestion}
            className="rounded-full px-6 py-5 font-semibold gap-2 shadow-md"
          >
            {applying ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            <span>{applying ? "Đang áp dụng..." : "Áp dụng phương án này"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
