"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarCheck,
  Clock,
  History,
  Lock,
  Unlock,
  UserX,
  X,
} from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import { Button } from "@/shared/ui/button";
import { formatDate } from "@/i18n/format";
import {
  getSeatingAuditLogs,
  getUnattendedGuests,
  type PlanningTable,
  type SeatingChange,
} from "../api/planning-seating.api";

interface SeatingDayOfDrawerProps {
  weddingId: string;
  isLocked: boolean;
  isEventStarted: boolean;
  isOpen: boolean;
  onClose: () => void;
  onChange: (change: SeatingChange) => Promise<void>;
  saving?: boolean;
  tables: PlanningTable[];
}

const ACTION_LABELS: Record<string, string> = {
  PLACE_TABLE: "Đặt bàn vào sảnh",
  MOVE_TABLE: "Di chuyển vị trí bàn",
  SWAP_TABLES: "Đổi chỗ 2 bàn tiệc",
  TAG_TABLES: "Gắn thẻ phân loại bàn",
  RENUMBER_TABLES: "Đánh số lại thứ tự bàn",
  MOVE_PARTY: "Xếp chỗ cho gia đình / nhóm khách",
  MOVE_PLACES: "Chuyển chỗ ngồi của khách",
  SWAP_PLACES: "Đổi chỗ ngồi giữa 2 khách",
  LOCK_PLAN: "Khóa sơ đồ chống chỉnh sửa",
  UNLOCK_PLAN: "Mở khóa sơ đồ bàn tiệc",
  START_EVENT: "Khai tiệc & Chốt mốc dự kiến",
  SWAP_UNATTENDED: "Điều chuyển ghế khách vắng",
  OPERATIONAL_MOVE: "Đổi chỗ trong ngày cưới",
  ADD_TABLE: "Thêm bàn tiệc mới",
  REMOVE_TABLE: "Thu hồi bàn tiệc",
};

export function SeatingDayOfDrawer({
  weddingId,
  isLocked,
  isEventStarted,
  isOpen,
  onClose,
  onChange,
  saving = false,
  tables,
}: SeatingDayOfDrawerProps) {
  const { api } = useRuntime();
  const [activeTab, setActiveTab] = useState<"operations" | "logs">("operations");
  const [selectedTableForUnattended, setSelectedTableForUnattended] = useState<string>(
    tables[0]?.id ?? "",
  );

  // Queries
  const logsQuery = useQuery({
    queryKey: ["seating-audit-logs", weddingId],
    queryFn: ({ signal }) => getSeatingAuditLogs(api, weddingId, signal),
    enabled: isOpen && activeTab === "logs",
  });

  const unattendedQuery = useQuery({
    queryKey: ["seating-unattended", weddingId, selectedTableForUnattended],
    queryFn: ({ signal }) =>
      getUnattendedGuests(api, weddingId, selectedTableForUnattended, signal),
    enabled: isOpen && activeTab === "operations" && !!selectedTableForUnattended,
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-card border-l border-border h-full flex flex-col p-6 shadow-2xl space-y-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <Activity className="size-5 text-primary" />
            <div>
              <h2 className="font-serif text-lg font-semibold text-foreground">
                Điều phối ngày tiệc cưới
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Các thao tác sắp xếp bàn ghế và tiếp đón khách trong ngày hôn lễ.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Status Pills */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-2xl border border-border bg-muted/30 p-3 space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">
              Trạng thái sơ đồ
            </span>
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              {isLocked ? (
                <>
                  <Lock className="size-3.5 text-amber-500" />
                  <span>Đã khóa chỉnh sửa</span>
                </>
              ) : (
                <>
                  <Unlock className="size-3.5 text-emerald-500" />
                  <span>Đang mở chỉnh sửa</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 p-3 space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">
              Tiến trình tiệc
            </span>
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              {isEventStarted ? (
                <>
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Đang diễn ra tiệc</span>
                </>
              ) : (
                <>
                  <Clock className="size-3.5 text-muted-foreground" />
                  <span>Chưa bắt đầu</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-muted/60 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("operations")}
            className={`flex-1 rounded-lg py-2 transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "operations"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            <CalendarCheck className="size-3.5" />
            <span>Thao tác tiệc</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("logs")}
            className={`flex-1 rounded-lg py-2 transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "logs"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            <History className="size-3.5" />
            <span>Nhật ký ({logsQuery.data?.length ?? 0})</span>
          </button>
        </div>

        {/* TAB 1: OPERATIONS */}
        {activeTab === "operations" && (
          <div className="space-y-5 text-xs">
            {/* Start Event Action */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <span className="font-serif text-sm font-semibold text-foreground">
                1. Chốt dự kiến &amp; Bắt đầu tiệc
              </span>
              <p className="text-muted-foreground leading-relaxed">
                Khi bấm bắt đầu, toàn bộ sơ đồ hiện tại sẽ được lưu thành mốc dự kiến ban đầu. Mọi thay đổi phát sinh từ thời điểm này sẽ được ghi nhận là điều phối thực tế.
              </p>
              <Button
                disabled={saving || isEventStarted}
                onClick={() => onChange({ action: "START_EVENT" })}
                className="w-full rounded-full py-4 font-semibold shadow-sm"
              >
                {isEventStarted ? "Tiệc đã được kích hoạt" : "Bắt đầu tiệc cưới ngay"}
              </Button>
            </div>

            {/* Lock / Unlock Plan */}
            <div className="rounded-2xl border border-border p-4 space-y-3">
              <span className="font-serif text-sm font-semibold text-foreground">
                2. Khóa / Mở khóa sơ đồ
              </span>
              <p className="text-muted-foreground leading-relaxed">
                Khóa sơ đồ giúp chống lại các thao tác vô ý kéo thả hoặc di dời bàn khi quầy lễ tân đang tiếp đón khách.
              </p>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => onChange({ action: isLocked ? "UNLOCK_PLAN" : "LOCK_PLAN" })}
                className="w-full rounded-full py-4 font-semibold"
              >
                {isLocked ? "Mở khóa sơ đồ bàn" : "Khóa sơ đồ bàn"}
              </Button>
            </div>

            {/* Unattended Guests & Empty Seats */}
            <div className="rounded-2xl border border-border p-4 space-y-3">
              <span className="font-serif text-sm font-semibold text-foreground">
                3. Ghế vắng / Chưa đến dự
              </span>
              <p className="text-muted-foreground leading-relaxed">
                Xem nhanh khách đã xếp chỗ nhưng chưa đến dự để tận dụng ghế cho khách phát sinh hoặc người đi kèm.
              </p>

              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground">
                  Chọn bàn để kiểm tra
                </label>
                <select
                  value={selectedTableForUnattended}
                  onChange={(e) => setSelectedTableForUnattended(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                >
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.number ? `Bàn ${String(t.number).padStart(2, "0")}` : t.name} (
                      {t.capacity} chỗ)
                    </option>
                  ))}
                </select>
              </div>

              {unattendedQuery.isPending ? (
                <div className="py-4 text-center text-muted-foreground">Đang tải ghế vắng...</div>
              ) : unattendedQuery.data && unattendedQuery.data.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {unattendedQuery.data.map((u) => (
                    <div
                      key={u.placeId}
                      className="flex items-center justify-between rounded-lg bg-muted/40 p-2 text-[11px]"
                    >
                      <div className="flex items-center gap-1.5">
                        <UserX className="size-3.5 text-amber-500" />
                        <span className="font-medium text-foreground">{u.guestName}</span>
                      </div>
                      <span className="font-mono text-muted-foreground">
                        Ghế #{u.seatNumber}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-emerald-500/10 p-2.5 text-center text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  Tất cả khách ở bàn này đã có mặt hoặc chưa có ghế vắng.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: AUDIT LOGS */}
        {activeTab === "logs" && (
          <div className="space-y-3 text-xs">
            {logsQuery.isPending ? (
              <div className="py-12 text-center text-muted-foreground">Đang tải nhật ký...</div>
            ) : !logsQuery.data || logsQuery.data.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                Chưa có thao tác thay đổi chỗ nào được ghi nhận.
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {logsQuery.data.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-primary">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDate(log.createdAt, "vi", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    {log.metadata && (
                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                        {log.metadata}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
