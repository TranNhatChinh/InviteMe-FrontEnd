"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Clock,
  Crown,
  Heart,
  Plus,
  Send,
  Sparkles,
  Users,
  UtensilsCrossed,
  ArrowRight,
} from "lucide-react";
import { gsap } from "gsap";
import { useWeddings } from "../hooks/use-weddings";
import { Button } from "@/shared/ui/button";
import { resolveWeddingMediaUrl } from "./wedding-cover-uploader";
import { formatDate } from "@/i18n/format";

function subscribeToClock(callback: () => void) {
  const timer = setInterval(callback, 60000);
  return () => clearInterval(timer);
}

function getNowSnapshot() {
  return Date.now();
}

function getGreetingSnapshot() {
  const hour = new Date().getHours();
  if (hour < 12) return "Chào buổi sáng";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

interface HostDashboardProps {
  user?: {
    displayName?: string;
    email?: string;
  } | null;
}

export function HostDashboard({ user }: HostDashboardProps) {
  const { data: weddingsData, isPending } = useWeddings({ page: 1, pageSize: 20 });
  const containerRef = useRef<HTMLDivElement>(null);

  const weddings = weddingsData?.items ?? [];
  const primaryWedding = weddings[0] ?? null;

  // Time-aware greeting & live clock via useSyncExternalStore
  const greeting = useSyncExternalStore(subscribeToClock, getGreetingSnapshot, () => "Xin chào");
  const now = useSyncExternalStore(subscribeToClock, getNowSnapshot, () => null);

  // Countdown to primary wedding
  const countdown = useMemo(() => {
    if (!primaryWedding?.weddingDate || now === null) return null;
    const target = new Date(primaryWedding.weddingDate).getTime();
    const diff = target - now;
    if (diff <= 0) return { days: 0, hours: 0, isPast: true };
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return { days, hours, isPast: false };
  }, [primaryWedding, now]);

  // GSAP entrance animation
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".dash-fade-in", {
        opacity: 0,
        y: 20,
        duration: 0.7,
        stagger: 0.12,
        ease: "power2.out",
      });
    }, containerRef);
    return () => ctx.revert();
  }, [isPending]);

  return (
    <div ref={containerRef} className="space-y-8 pb-12">
      {/* 1. HERO GREETING & QUICK STATUS */}
      <section className="dash-fade-in relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-6 sm:p-10 shadow-sm">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 size-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="size-3.5" />
              <span>Không gian điều hành lễ cưới</span>
            </div>
            <h1 className="font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl">
              {greeting}, {user?.displayName || "Bạn"}
            </h1>
            <p className="max-w-xl text-sm sm:text-base text-muted-foreground font-light leading-relaxed">
              Chào mừng bạn trở lại với InviteMe. Dưới đây là tiến độ chuẩn bị và những việc cần lưu tâm cho ngày trọng đại.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild className="rounded-full px-6 py-5 font-medium shadow-md shadow-primary/20 gap-2">
              <Link href="/weddings/new">
                <Plus className="size-4" />
                <span>Tạo lễ cưới mới</span>
              </Link>
            </Button>
            {primaryWedding && (
              <Button asChild variant="outline" className="rounded-full px-6 py-5 font-medium gap-2">
                <Link href={`/weddings/${primaryWedding.id}/plan`}>
                  <Crown className="size-4 text-amber-500" />
                  <span>Gói dịch vụ</span>
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* 2. PRIMARY WEDDING SPOTLIGHT CARD */}
      {isPending ? (
        <div className="dash-fade-in h-72 animate-pulse rounded-3xl border border-border bg-card/60" />
      ) : primaryWedding ? (
        <section className="dash-fade-in grid gap-6 lg:grid-cols-12 items-stretch">
          {/* Main banner */}
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm lg:col-span-8 flex flex-col justify-between p-6 sm:p-8">
            {primaryWedding.coverImageUrl && resolveWeddingMediaUrl(primaryWedding.coverImageUrl) && (
              <div className="absolute inset-0 z-0 opacity-15 overflow-hidden">
                <Image
                  src={resolveWeddingMediaUrl(primaryWedding.coverImageUrl) as string}
                  alt={primaryWedding.title}
                  fill
                  className="object-cover"
                />
              </div>
            )}
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                  <Heart className="size-3 fill-current" />
                  <span>Lễ cưới đang diễn ra</span>
                </span>
                <Link
                  href={`/weddings/${primaryWedding.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <span>Vào trung tâm quản trị</span>
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>

              <div>
                <h2 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                  {primaryWedding.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {primaryWedding.weddingDate
                    ? formatDate(primaryWedding.weddingDate, "vi", { dateStyle: "full" })
                    : "Chưa ấn định ngày cưới chính thức"}
                </p>
              </div>
            </div>

            {/* Metrics footer */}
            <div className="relative z-10 mt-8 grid grid-cols-2 sm:grid-cols-3 gap-4 border-t border-border/60 pt-6">
              <div>
                <div className="text-xs text-muted-foreground">Khách mời xác nhận</div>
                <div className="mt-1 font-serif text-2xl font-bold text-foreground">
                  {primaryWedding.participantCount} / {primaryWedding.maxCapacity || "∞"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Trạng thái website</div>
                <div className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Sẵn sàng</span>
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1 flex items-center justify-end">
                <Button asChild variant="outline" className="rounded-full text-xs gap-1.5">
                  <Link href={`/weddings/${primaryWedding.id}/invitations`}>
                    <Send className="size-3.5" />
                    <span>Gửi thiệp</span>
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Countdown card */}
          <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8 lg:col-span-4 flex flex-col justify-between shadow-sm">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Clock className="size-4" />
                <span>Đếm ngược ngày cưới</span>
              </div>
              <h3 className="font-serif text-lg font-medium text-foreground">Thời khắc thiêng liêng</h3>
            </div>

            <div className="my-6">
              {countdown ? (
                countdown.isPast ? (
                  <div className="rounded-2xl bg-muted/60 p-4 text-center">
                    <p className="font-serif text-lg font-medium text-foreground">Ngày vui đã diễn ra trọn vẹn!</p>
                    <p className="text-xs text-muted-foreground mt-1">Hãy tiếp tục gửi lời cảm ơn và lưu giữ khoảnh khắc.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="rounded-2xl border border-primary/20 bg-card p-4 shadow-sm">
                      <div className="font-serif text-4xl font-bold text-primary">{countdown.days}</div>
                      <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider font-semibold">
                        Ngày nữa
                      </div>
                    </div>
                    <div className="rounded-2xl border border-primary/20 bg-card p-4 shadow-sm">
                      <div className="font-serif text-4xl font-bold text-foreground">{countdown.hours}</div>
                      <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider font-semibold">
                        Giờ
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div className="rounded-2xl bg-muted/40 p-4 text-center text-xs text-muted-foreground">
                  Hãy cài đặt ngày cưới trong mục Cài đặt để kích hoạt bộ đếm ngược.
                </div>
              )}
            </div>

            <Button asChild variant="outline" className="w-full rounded-full text-xs">
              <Link href={`/weddings/${primaryWedding.id}/guests`}>
                <Users className="size-3.5 mr-1.5" />
                <span>Xem danh sách khách</span>
              </Link>
            </Button>
          </div>
        </section>
      ) : (
        /* Empty State */
        <section className="dash-fade-in rounded-3xl border border-dashed border-border p-12 text-center bg-card/40">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Heart className="size-8" />
          </div>
          <h2 className="mt-4 font-serif text-2xl font-normal text-foreground">Bạn chưa có lễ cưới nào</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Bắt đầu tạo không gian số đầu tiên cho ngày hạnh phúc của hai bạn với thiệp cưới điện tử, sơ đồ bàn tiệc và mã mừng VietQR.
          </p>
          <Button asChild className="mt-6 rounded-full px-8 py-5">
            <Link href="/weddings/new">
              <Plus className="size-4 mr-2" />
              <span>Khởi tạo lễ cưới ngay</span>
            </Link>
          </Button>
        </section>
      )}

      {/* 3. PLANNING STEPS CHECKLIST */}
      {primaryWedding && (
        <section className="dash-fade-in rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
            <div>
              <h2 className="font-serif text-xl sm:text-2xl font-semibold text-foreground">
                Lộ trình chuẩn bị hôn lễ
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Các hạng mục thiết yếu cần hoàn tất trước ngày cử hành hôn lễ.
              </p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Bước quan trọng
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Step 1 */}
            <Link
              href={`/weddings/${primaryWedding.id}`}
              className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-muted/20 p-5 transition-all hover:border-primary/40 hover:bg-card hover:shadow-sm"
            >
              <div className="space-y-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Heart className="size-5" />
                </div>
                <h3 className="font-serif text-base font-semibold text-foreground">1. Thiết kế Website cưới</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Tùy chỉnh thông điệp, câu chuyện tình yêu, album ảnh và địa điểm tổ chức.
                </p>
              </div>
              <div className="mt-4 flex items-center text-xs font-medium text-primary">
                <span>Thiết lập</span>
                <ArrowRight className="size-3 ml-1 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>

            {/* Step 2 */}
            <Link
              href={`/weddings/${primaryWedding.id}/guests`}
              className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-muted/20 p-5 transition-all hover:border-primary/40 hover:bg-card hover:shadow-sm"
            >
              <div className="space-y-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Users className="size-5" />
                </div>
                <h3 className="font-serif text-base font-semibold text-foreground">2. Danh sách khách mời</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Nhập danh sách từ Excel, phân nhóm nhà trai/nhà gái và tạo mã thiệp riêng.
                </p>
              </div>
              <div className="mt-4 flex items-center text-xs font-medium text-primary">
                <span>Quản lý</span>
                <ArrowRight className="size-3 ml-1 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>

            {/* Step 3 */}
            <Link
              href={`/weddings/${primaryWedding.id}/seating`}
              className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-muted/20 p-5 transition-all hover:border-primary/40 hover:bg-card hover:shadow-sm"
            >
              <div className="space-y-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <UtensilsCrossed className="size-5" />
                </div>
                <h3 className="font-serif text-base font-semibold text-foreground">3. Sơ đồ bàn tiệc</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Xếp chỗ ngồi thông minh cho từng bàn, tránh xung đột nhóm và tối ưu chỗ trống.
                </p>
              </div>
              <div className="mt-4 flex items-center text-xs font-medium text-primary">
                <span>Xếp bàn</span>
                <ArrowRight className="size-3 ml-1 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>

            {/* Step 4 */}
            <Link
              href={`/weddings/${primaryWedding.id}/invitations`}
              className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-muted/20 p-5 transition-all hover:border-primary/40 hover:bg-card hover:shadow-sm"
            >
              <div className="space-y-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Send className="size-5" />
                </div>
                <h3 className="font-serif text-base font-semibold text-foreground">4. Gửi thiệp &amp; RSVP</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Gửi thiệp tự động qua Email/SMS và theo dõi phản hồi tham dự thời gian thực.
                </p>
              </div>
              <div className="mt-4 flex items-center text-xs font-medium text-primary">
                <span>Gửi ngay</span>
                <ArrowRight className="size-3 ml-1 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          </div>
        </section>
      )}

      {/* 4. OTHER WEDDINGS LIST (IF MULTIPLE) */}
      {weddings.length > 1 && (
        <section className="dash-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl font-semibold text-foreground">
              Các lễ cưới khác của bạn ({weddings.length})
            </h2>
            <Button asChild variant="outline" size="sm" className="rounded-full text-xs">
              <Link href="/weddings">Xem tất cả</Link>
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {weddings.slice(1).map((w) => (
              <Link
                key={w.id}
                href={`/weddings/${w.id}`}
                className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-sm"
              >
                <div>
                  <h3 className="font-serif text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                    {w.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {w.weddingDate ? formatDate(w.weddingDate, "vi", { dateStyle: "medium" }) : "Chưa chọn ngày"}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3 text-xs text-muted-foreground">
                  <span>{w.participantCount} khách mời</span>
                  <span className="inline-flex items-center gap-1 text-primary">
                    Chi tiết <ArrowRight className="size-3" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
