"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Minus,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { gsap } from "gsap";
import { useRuntime } from "@/core/config/runtime";
import { Button } from "@/shared/ui/button";
import { formatCurrency } from "@/i18n/format";
import { getPublicPlans, type PlanDto } from "../api/plans.api";

// Fallback plans in case backend is offline or loading
const FALLBACK_PLANS: PlanDto[] = [
  {
    code: "FREE",
    name: "Miễn phí",
    price: 0,
    currency: "VND",
    limits: {
      guestPlaces: 50,
      mediaImages: 10,
      emailInvites: 50,
      smsInvites: 0,
      reminderRounds: 0,
      coHosts: 0,
      seatingTables: 5,
      checkin: false,
      giftQr: false,
      giftExport: false,
      aiThankYouRuns: 0,
      premiumTemplates: false,
      brandingBadge: true,
      customSlug: false,
      publicLinkDaysAfterWedding: 7,
      publicSeatLookup: false,
      retentionDaysAfterWedding: 30,
    },
  },
  {
    code: "BASIC",
    name: "Cơ bản",
    price: 299000,
    currency: "VND",
    limits: {
      guestPlaces: 300,
      mediaImages: 60,
      emailInvites: 600,
      smsInvites: 100,
      reminderRounds: 2,
      coHosts: 2,
      seatingTables: null,
      checkin: true,
      giftQr: true,
      giftExport: true,
      aiThankYouRuns: 1,
      premiumTemplates: true,
      brandingBadge: false,
      customSlug: true,
      publicLinkDaysAfterWedding: 183,
      publicSeatLookup: true,
      retentionDaysAfterWedding: 365,
    },
  },
  {
    code: "PREMIUM",
    name: "Cao cấp",
    price: 699000,
    currency: "VND",
    limits: {
      guestPlaces: 1000,
      mediaImages: 200,
      emailInvites: 2000,
      smsInvites: 500,
      reminderRounds: null,
      coHosts: 10,
      seatingTables: null,
      checkin: true,
      giftQr: true,
      giftExport: true,
      aiThankYouRuns: 5,
      premiumTemplates: true,
      brandingBadge: false,
      customSlug: true,
      publicLinkDaysAfterWedding: 730,
      publicSeatLookup: true,
      retentionDaysAfterWedding: 730,
    },
  },
];

const COMPARISON_ROWS = [
  {
    category: "Quy mô & Lưu trữ",
    items: [
      { name: "Số lượng khách mời", free: "50 khách", basic: "300 khách", premium: "1,000 khách" },
      { name: "Số lượng ảnh album cưới", free: "10 ảnh", basic: "60 ảnh", premium: "200 ảnh" },
      { name: "Thời gian lưu giữ website", free: "7 ngày sau cưới", basic: "6 tháng sau cưới", premium: "2 năm sau cưới" },
      { name: "Tùy chỉnh link cưới riêng (Slug)", free: false, basic: true, premium: true },
      { name: "Xóa logo / bản quyền InviteMe", free: false, basic: true, premium: true },
    ],
  },
  {
    category: "Gửi thiệp & Tương tác RSVP",
    items: [
      { name: "Mẫu thiệp cưới & trang Story", free: "Mẫu tiêu chuẩn", basic: "Tất cả mẫu cao cấp", premium: "Tất cả mẫu cao cấp" },
      { name: "Lượt gửi thiệp qua Email", free: "50 lượt", basic: "600 lượt", premium: "2,000 lượt" },
      { name: "Lượt gửi thiệp qua SMS Brand", free: "—", basic: "100 SMS", premium: "500 SMS" },
      { name: "Đợt gửi nhắc hẹn RSVP tự động", free: "—", basic: "2 đợt", premium: "Không giới hạn" },
      { name: "Trợ lý AI viết lời cảm ơn", free: "—", basic: "1 lượt", premium: "5 lượt" },
    ],
  },
  {
    category: "Tiệc cưới & Đón khách",
    items: [
      { name: "Sơ đồ xếp bàn tiệc (Seating)", free: "Tối đa 5 bàn", basic: "Không giới hạn bàn", premium: "Không giới hạn bàn" },
      { name: "Khách tra cứu bàn tiệc công khai", free: false, basic: true, premium: true },
      { name: "Quét QR Check-in đón khách tại cửa", free: false, basic: true, premium: true },
      { name: "Số lượng Co-host cùng quản lý", free: "Chỉ chủ tiệc", basic: "2 Co-hosts", premium: "10 Co-hosts" },
      { name: "Mã VietQR mừng cưới & Quản lý quà", free: false, basic: true, premium: true },
      { name: "Xuất sổ mừng cưới ra file Excel", free: false, basic: true, premium: true },
    ],
  },
];

const FAQS = [
  {
    q: "Gói cước tính phí một lần hay theo tháng?",
    a: "Tất cả các gói trả phí của InviteMe đều thanh toán MỘT LẦN DUY NHẤT cho trọn vẹn sự kiện đám cưới của bạn. Không phát sinh phí gia hạn hàng tháng hay bất kỳ phụ phí ẩn nào.",
  },
  {
    q: "Tôi có thể bắt đầu với gói Miễn phí rồi nâng cấp sau được không?",
    a: "Hoàn toàn được! Bạn có thể tạo đám cưới, nhập danh sách khách và thiết kế thiệp hoàn toàn miễn phí. Khi số lượng khách tăng lên hoặc cần tính năng Check-in, VietQR mừng cưới, bạn chỉ cần bấm nâng cấp.",
  },
  {
    q: "Phương thức thanh toán diễn ra như thế nào?",
    a: "Bạn chỉ cần mở ứng dụng ngân hàng bất kỳ (Vietcombank, MB, Techcombank, VPBank,...) quét mã VietQR tự động. Hệ thống sẽ khớp nội dung và kích hoạt gói cưới của bạn chỉ trong 5–30 giây.",
  },
  {
    q: "Sau ngày cưới thì website và dữ liệu có bị xóa không?",
    a: "Dữ liệu được lưu giữ an toàn theo hạn mức gói: Gói Miễn phí lưu 7 ngày sau cưới, Gói Cơ bản lưu 6 tháng và Gói Cao cấp lưu tới 2 năm để hai bạn thoải mái xem lại kỷ niệm và tải sổ mừng.",
  },
];

export function PricingTable() {
  const { api } = useRuntime();
  const [showComparison, setShowComparison] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const plansQuery = useQuery({
    queryKey: ["public-plans"],
    queryFn: ({ signal }) => getPublicPlans(api, signal),
    staleTime: 60_000,
  });

  const plans = (plansQuery.data && plansQuery.data.length > 0) ? plansQuery.data : FALLBACK_PLANS;

  // GSAP animation for cards on mount
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".pricing-hero-item", {
        opacity: 0,
        y: 24,
        duration: 0.8,
        stagger: 0.15,
        ease: "power2.out",
      });
      gsap.from(".pricing-card", {
        opacity: 0,
        y: 36,
        duration: 0.9,
        stagger: 0.18,
        ease: "power3.out",
        delay: 0.3,
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className="pricing-page min-h-screen py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
        <p className="pricing-hero-item text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Bảng giá &amp; Gói dịch vụ
        </p>
        <h1 className="pricing-hero-item font-serif text-3xl sm:text-4xl md:text-5xl font-normal tracking-tight text-foreground">
          Đồng hành cùng ngày trọng đại của hai bạn
        </h1>
        <p className="pricing-hero-item text-muted-foreground text-base sm:text-lg leading-relaxed">
          Thanh toán <strong>một lần duy nhất</strong> cho mỗi đám cưới. Trọn gói không giới hạn thời gian chuẩn bị, không phí ẩn.
        </p>
        <div className="pricing-hero-item inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-1.5 text-xs text-muted-foreground shadow-sm">
          <ShieldCheck className="size-4 text-emerald-600" />
          <span>Kích hoạt tự động tức thì qua VietQR · Hỗ trợ đồng hành 24/7</span>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch mb-16">
        {plans.map((plan) => {
          const isPopular = plan.code === "BASIC";
          const isVip = plan.code === "PREMIUM";

          return (
            <div
              key={plan.code}
              className={`pricing-card relative flex flex-col rounded-3xl border transition-all duration-300 p-8 shadow-sm ${
                isPopular
                  ? "border-primary bg-card ring-2 ring-primary/20 shadow-xl md:-translate-y-2"
                  : isVip
                    ? "border-amber-400/60 bg-gradient-to-b from-card via-card to-amber-50/20 dark:to-amber-950/10 shadow-md"
                    : "border-border bg-card/60 hover:border-border/80"
              }`}
            >
              {/* Badge */}
              {isPopular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3.5 py-1 text-xs font-semibold text-primary-foreground shadow-sm">
                    <Sparkles className="size-3" />
                    Được chọn nhiều nhất
                  </span>
                </div>
              )}
              {isVip && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-3.5 py-1 text-xs font-semibold text-white shadow-sm">
                    <Zap className="size-3" />
                    Trọn gói VIP cao cấp
                  </span>
                </div>
              )}

              {/* Title & Price */}
              <div className="border-b border-border/60 pb-6 mb-6">
                <h3 className="font-serif text-2xl font-normal text-foreground">{plan.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 min-h-[32px]">
                  {plan.code === "FREE"
                    ? "Hoàn hảo cho tiệc nhỏ ấm cúng hoặc trải nghiệm thử."
                    : plan.code === "BASIC"
                      ? "Giải pháp hoàn hảo cho hầu hết các đám cưới Việt Nam."
                      : "Trải nghiệm sang trọng đẳng cấp với mọi đặc quyền cao nhất."}
                </p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground font-serif">
                    {plan.price === 0 ? "0 đ" : formatCurrency(plan.price, "vi")}
                  </span>
                  <span className="text-xs text-muted-foreground font-normal">/ trọn gói đám cưới</span>
                </div>
              </div>

              {/* Core Feature List */}
              <ul className="space-y-3.5 text-sm flex-1 mb-8">
                <li className="flex items-start gap-3 text-foreground font-medium">
                  <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  <span>
                    <strong>{plan.limits.guestPlaces ?? "Không giới hạn"}</strong> khách mời &amp; chỗ ngồi
                  </span>
                </li>
                <li className="flex items-start gap-3 text-foreground">
                  <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  <span>
                    <strong>{plan.limits.mediaImages ?? "Không giới hạn"}</strong> ảnh chất lượng cao
                  </span>
                </li>
                <li className="flex items-start gap-3 text-foreground">
                  <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  <span>
                    <strong>{plan.limits.emailInvites ?? "Không giới hạn"}</strong> email gửi thiệp mời
                  </span>
                </li>

                {plan.limits.smsInvites ? (
                  <li className="flex items-start gap-3 text-foreground">
                    <Check className="size-4 shrink-0 text-primary mt-0.5" />
                    <span>
                      <strong>{plan.limits.smsInvites}</strong> tin nhắn SMS thiệp cưới
                    </span>
                  </li>
                ) : (
                  <li className="flex items-start gap-3 text-muted-foreground/60 line-through">
                    <Minus className="size-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                    <span>Gửi tin nhắn SMS</span>
                  </li>
                )}

                {plan.limits.coHosts ? (
                  <li className="flex items-start gap-3 text-foreground">
                    <Check className="size-4 shrink-0 text-primary mt-0.5" />
                    <span>
                      <strong>{plan.limits.coHosts}</strong> Co-host cùng chuẩn bị
                    </span>
                  </li>
                ) : (
                  <li className="flex items-start gap-3 text-muted-foreground/60 line-through">
                    <Minus className="size-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                    <span>Thêm Co-host cùng quản lý</span>
                  </li>
                )}

                <li className="flex items-start gap-3 text-foreground">
                  <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  <span>
                    Sơ đồ bàn:{" "}
                    <strong>
                      {plan.limits.seatingTables ? `${plan.limits.seatingTables} bàn` : "Không giới hạn bàn"}
                    </strong>
                  </span>
                </li>

                <li className={`flex items-start gap-3 ${plan.limits.checkin ? "text-foreground" : "text-muted-foreground/60 line-through"}`}>
                  {plan.limits.checkin ? (
                    <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  ) : (
                    <Minus className="size-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                  )}
                  <span>Quét QR Check-in đón khách tại cửa</span>
                </li>

                <li className={`flex items-start gap-3 ${plan.limits.giftQr ? "text-foreground" : "text-muted-foreground/60 line-through"}`}>
                  {plan.limits.giftQr ? (
                    <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  ) : (
                    <Minus className="size-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                  )}
                  <span>Mừng cưới VietQR &amp; Xuất sổ mừng</span>
                </li>

                <li className={`flex items-start gap-3 ${plan.limits.customSlug ? "text-foreground" : "text-muted-foreground/60 line-through"}`}>
                  {plan.limits.customSlug ? (
                    <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  ) : (
                    <Minus className="size-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                  )}
                  <span>Tùy chỉnh link website riêng</span>
                </li>

                <li className="flex items-start gap-3 text-foreground">
                  <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  <span>
                    Lưu trữ website:{" "}
                    <strong>
                      {plan.limits.publicLinkDaysAfterWedding === 7
                        ? "7 ngày sau cưới"
                        : plan.limits.publicLinkDaysAfterWedding === 183
                          ? "6 tháng sau cưới"
                          : "2 năm sau cưới"}
                    </strong>
                  </span>
                </li>
              </ul>

              {/* Action Button */}
              <div className="pt-2">
                {plan.code === "FREE" ? (
                  <Button asChild variant="outline" className="w-full rounded-full py-5 text-sm font-medium">
                    <Link href="/register">Bắt đầu miễn phí</Link>
                  </Button>
                ) : (
                  <Button
                    asChild
                    variant="default"
                    className={`w-full rounded-full py-5 text-sm font-semibold gap-2 ${
                      isPopular
                        ? "bg-primary text-primary-foreground hover:bg-primary-hover shadow-md"
                        : "bg-amber-600 text-white hover:bg-amber-700 shadow-sm"
                    }`}
                  >
                    <Link href="/register">
                      <span>Chọn gói {plan.name}</span>
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Feature Comparison Section */}
      <div className="rounded-3xl border border-border bg-card p-6 sm:p-10 mb-16 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <h2 className="font-serif text-2xl font-normal text-foreground">Bảng so sánh chi tiết tính năng</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Xem đầy đủ thông số kỹ thuật và đặc quyền của từng gói.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowComparison(!showComparison)}
            className="rounded-full gap-2 text-xs"
          >
            <span>{showComparison ? "Thu gọn bảng" : "Xem toàn bộ bảng"}</span>
            {showComparison ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </div>

        {showComparison && (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-foreground">
                  <th className="py-3 px-4 font-semibold w-2/5">Tính năng</th>
                  <th className="py-3 px-4 font-semibold text-center w-1/5">Miễn phí</th>
                  <th className="py-3 px-4 font-semibold text-center w-1/5 text-primary">Cơ bản</th>
                  <th className="py-3 px-4 font-semibold text-center w-1/5 text-amber-600">Cao cấp</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((section, idx) => (
                  <tr key={idx} className="contents">
                    <td colSpan={4} className="bg-muted/40 font-semibold px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">
                      {section.category}
                    </td>
                    {section.items.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4 text-foreground font-medium">{row.name}</td>
                        <td className="py-3 px-4 text-center text-muted-foreground">
                          {typeof row.free === "boolean" ? (
                            row.free ? <Check className="size-4 text-emerald-600 mx-auto" /> : <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                          ) : (
                            row.free
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-medium text-foreground">
                          {typeof row.basic === "boolean" ? (
                            row.basic ? <Check className="size-4 text-primary mx-auto" /> : <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                          ) : (
                            row.basic
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-foreground">
                          {typeof row.premium === "boolean" ? (
                            row.premium ? <Check className="size-4 text-amber-600 mx-auto" /> : <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                          ) : (
                            row.premium
                          )}
                        </td>
                      </tr>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FAQs */}
      <div className="max-w-3xl mx-auto mb-16">
        <h2 className="font-serif text-2xl font-normal text-center mb-8 text-foreground">
          Câu hỏi thường gặp về gói cước
        </h2>
        <div className="space-y-4">
          {FAQS.map((faq, index) => {
            const isOpen = openFaq === index;
            return (
              <div
                key={index}
                className="rounded-2xl border border-border bg-card p-5 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                  className="flex w-full items-center justify-between gap-4 text-left font-medium text-foreground"
                >
                  <span className="font-serif text-base">{faq.q}</span>
                  {isOpen ? <ChevronUp className="size-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-4 shrink-0 text-muted-foreground" />}
                </button>
                {isOpen && (
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed animate-in fade-in duration-200">
                    {faq.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom CTA Banner */}
      <div className="rounded-3xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-amber-500/10 p-8 sm:p-12 text-center max-w-4xl mx-auto shadow-sm space-y-4">
        <h2 className="font-serif text-2xl sm:text-3xl text-foreground font-normal">
          Sẵn sàng tạo thiệp cưới trong mơ của hai bạn?
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
          Bắt đầu miễn phí ngay hôm nay. Chỉ mất chưa đầy 3 phút để có ngay một website cưới và thiệp online chuyên nghiệp.
        </p>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
          <Button asChild className="rounded-full px-8 h-12 font-semibold shadow-md">
            <Link href="/register">
              Bắt đầu tạo thiệp ngay <ArrowRight className="size-4 ml-1" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full px-6 h-12">
            <Link href="/#templates">Xem các mẫu thiết kế</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
