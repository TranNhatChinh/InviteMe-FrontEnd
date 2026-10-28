"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
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

// Dữ liệu dự phòng trong trường hợp đang kết nối hoặc tải thông tin
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
      { name: "Số lượng khách mời & chỗ ngồi", free: "50 khách", basic: "300 khách", premium: "1,000 khách" },
      { name: "Số lượng ảnh album cưới", free: "10 ảnh", basic: "60 ảnh", premium: "200 ảnh" },
      { name: "Thời gian lưu giữ website", free: "7 ngày sau cưới", basic: "6 tháng sau cưới", premium: "2 năm sau cưới" },
      { name: "Tùy chỉnh đường dẫn website riêng (theo tên hai bạn)", free: false, basic: true, premium: true },
      { name: "Xóa logo InviteMe trên thiệp", free: false, basic: true, premium: true },
    ],
  },
  {
    category: "Gửi thiệp & Xác nhận tham dự",
    items: [
      { name: "Mẫu thiệp cưới & trang chuyện tình yêu", free: "Mẫu tiêu chuẩn", basic: "Tất cả mẫu cao cấp", premium: "Tất cả mẫu cao cấp" },
      { name: "Lượt gửi thiệp qua thư điện tử (Email)", free: "50 lượt", basic: "600 lượt", premium: "2,000 lượt" },
      { name: "Lượt gửi thiệp qua tin nhắn SMS", free: "—", basic: "100 SMS", premium: "500 SMS" },
      { name: "Đợt tự động nhắc khách xác nhận tham dự", free: "—", basic: "2 đợt", premium: "Không giới hạn" },
      { name: "Trợ lý thông minh gợi ý lời cảm ơn", free: "—", basic: "1 lượt", premium: "5 lượt" },
    ],
  },
  {
    category: "Tiệc cưới & Đón tiếp khách",
    items: [
      { name: "Sơ đồ sắp xếp chỗ ngồi & bàn tiệc", free: "Tối đa 5 bàn", basic: "Không giới hạn bàn", premium: "Không giới hạn bàn" },
      { name: "Khách tự xem vị trí bàn tiệc của mình trên điện thoại", free: false, basic: true, premium: true },
      { name: "Đón tiếp & quét mã điểm danh tại sảnh cưới", free: false, basic: true, premium: true },
      { name: "Số người cùng tham gia quản lý tiệc", free: "Chỉ chủ tiệc", basic: "2 người đồng hành", premium: "10 người đồng hành" },
      { name: "Mã QR nhận mừng cưới & ghi nhận quà mừng", free: false, basic: true, premium: true },
      { name: "Tải sổ mừng cưới về máy tính (file bảng tính Excel)", free: false, basic: true, premium: true },
    ],
  },
];

const FAQS = [
  {
    q: "Gói dịch vụ thanh toán một lần hay theo tháng?",
    a: "Tất cả các gói trả phí của InviteMe đều thanh toán MỘT LẦN DUY NHẤT cho trọn vẹn sự kiện đám cưới của hai bạn. Không phát sinh phí gia hạn hàng tháng hay bất kỳ chi phí ẩn nào.",
  },
  {
    q: "Hai bạn có thể bắt đầu với gói Miễn phí rồi nâng cấp sau không?",
    a: "Hoàn toàn được! Hai bạn có thể tạo đám cưới, nhập danh sách khách và thiết kế thiệp hoàn toàn miễn phí. Khi số lượng khách tăng lên hoặc cần tính năng Điểm danh đón khách, Mừng cưới qua mã QR, hai bạn chỉ cần bấm nâng cấp bất cứ lúc nào.",
  },
  {
    q: "Phương thức thanh toán diễn ra như thế nào?",
    a: "Hai bạn chỉ cần mở ứng dụng ngân hàng bất kỳ (Vietcombank, MB, Techcombank, VPBank,...) quét mã QR tự động. Hệ thống sẽ nhận diện và kích hoạt gói cưới cho hai bạn chỉ trong 5–30 giây.",
  },
  {
    q: "Sau ngày cưới thì website và hình ảnh có bị xóa không?",
    a: "Kỷ niệm của hai bạn được lưu giữ an toàn theo hạn mức gói: Gói Miễn phí lưu 7 ngày sau cưới, Gói Cơ bản lưu 6 tháng và Gói Cao cấp lưu tới 2 năm để hai bạn thoải mái xem lại và tải sổ mừng về máy tính.",
  },
];

export interface PricingTableProps {
  embedded?: boolean;
  /** Where "start" buttons go; the app passes the workspace for a signed-in user. */
  startHref?: string;
  /** Where a paid plan button goes; the app sends a signed-in user to that wedding's plan page. */
  planHref?: (code: string) => string;
}

export function PricingTable({
  embedded = false,
  startHref = "/register",
  planHref = (code) => `/register?plan=${code}`,
}: PricingTableProps) {
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

  // GSAP animation khi phần bảng giá cuộn vào tầm nhìn
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    let played = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting && !played) {
          played = true;
          gsap.fromTo(
            el.querySelectorAll(".pricing-card"),
            { opacity: 0, y: 32 },
            { opacity: 1, y: 0, duration: 0.7, stagger: 0.15, ease: "power3.out" }
          );
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const content = (
    <>
      {/* Cành lá trang trí phong cách thiệp cưới */}
      {embedded && (
        <div className="section-botanicals" aria-hidden="true">
          {["left", "right"].map((side) => (
            <div
              className={`section-botanicals__branch section-botanicals__branch--${side}`}
              key={side}
            >
              <Image
                src="/images/hero/botanical-stem-v2.webp"
                alt=""
                fill
                sizes="180px"
                className="section-botanicals__stem"
              />
              {[0, 1, 2, 3, 4].map((i) => (
                <span className={`section-botanicals__leaf section-botanicals__leaf--${i}`} key={i}>
                  <Image src="/images/hero/botanical-leaf.webp" alt="" fill sizes="90px" />
                </span>
              ))}
              <span className="section-botanicals__gold">
                <Image src="/images/hero/botanical-gold.webp" alt="" fill sizes="150px" />
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className={`${embedded ? "landing-heading" : "text-center"} max-w-3xl mx-auto mb-14 space-y-3`}>
        <p className={`${embedded ? "landing-eyebrow" : "text-xs font-semibold uppercase tracking-[0.2em] text-primary"}`}>
          BẢNG GIÁ &amp; GÓI DỊCH VỤ
        </p>
        <h2 id="pricing-title" className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal tracking-tight text-foreground">
          Đồng hành cùng ngày trọng đại của hai bạn
        </h2>
        <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
          Thanh toán <strong>một lần duy nhất</strong> cho trọn vẹn ngày vui. Không phí duy trì hàng tháng, không chi phí ẩn.
        </p>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-1.5 text-xs text-muted-foreground shadow-sm mt-2">
          <ShieldCheck className="size-4 text-emerald-600" />
          <span>Kích hoạt tự động tức thì qua mã QR · Hỗ trợ đồng hành 24/7</span>
        </div>
      </div>

      {/* Grid 3 gói cước */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch mb-14">
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
              {/* Ruy băng nổi bật */}
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

              {/* Tên gói & Giá */}
              <div className="border-b border-border/60 pb-6 mb-6">
                <h3 className="font-serif text-2xl font-normal text-foreground">{plan.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 min-h-[32px]">
                  {plan.code === "FREE"
                    ? "Hoàn hảo cho tiệc nhỏ ấm cúng hoặc trải nghiệm tạo thử thiệp."
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

              {/* Danh sách đặc quyền */}
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
                    <strong>{plan.limits.mediaImages ?? "Không giới hạn"}</strong> ảnh album cưới sắc nét
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
                      <strong>{plan.limits.coHosts}</strong> người đồng hành cùng quản lý
                    </span>
                  </li>
                ) : (
                  <li className="flex items-start gap-3 text-muted-foreground/60 line-through">
                    <Minus className="size-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                    <span>Thêm người đồng hành</span>
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
                  <span>Đón tiếp &amp; quét mã điểm danh tại sảnh</span>
                </li>

                <li className={`flex items-start gap-3 ${plan.limits.giftQr ? "text-foreground" : "text-muted-foreground/60 line-through"}`}>
                  {plan.limits.giftQr ? (
                    <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  ) : (
                    <Minus className="size-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                  )}
                  <span>Mừng cưới qua mã QR &amp; Tải sổ mừng</span>
                </li>

                <li className={`flex items-start gap-3 ${plan.limits.customSlug ? "text-foreground" : "text-muted-foreground/60 line-through"}`}>
                  {plan.limits.customSlug ? (
                    <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  ) : (
                    <Minus className="size-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                  )}
                  <span>Đường dẫn website riêng theo tên hai bạn</span>
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

              {/* Nút hành động */}
              <div className="pt-2">
                {plan.code === "FREE" ? (
                  <Button asChild variant="outline" className="w-full rounded-full py-5 text-sm font-medium">
                    <Link href={startHref}>{startHref === "/register" ? "Bắt đầu miễn phí" : "Vào không gian làm việc"}</Link>
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
                    <Link href={planHref(plan.code)}>
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

      {/* Bảng so sánh chi tiết tính năng */}
      <div className="rounded-3xl border border-border bg-card p-6 sm:p-10 mb-12 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <h3 className="font-serif text-2xl font-normal text-foreground">Bảng so sánh chi tiết tính năng</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Xem đầy đủ thông số và quyền lợi cụ thể của từng gói dịch vụ.
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

      {/* FAQs (chỉ hiển thị đầy đủ trên trang /pricing độc lập) */}
      {!embedded && (
        <>
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

          <div className="rounded-3xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-amber-500/10 p-8 sm:p-12 text-center max-w-4xl mx-auto shadow-sm space-y-4">
            <h2 className="font-serif text-2xl sm:text-3xl text-foreground font-normal">
              Sẵn sàng tạo thiệp cưới trong mơ của hai bạn?
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
              Bắt đầu miễn phí ngay hôm nay. Chỉ mất chưa đầy 3 phút để có ngay một website cưới và thiệp online chuyên nghiệp.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
              <Button asChild className="rounded-full px-8 h-12 font-semibold shadow-md">
                <Link href={startHref}>
                  Bắt đầu tạo thiệp ngay <ArrowRight className="size-4 ml-1" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full px-6 h-12">
                <Link href="/#templates">Xem các mẫu thiết kế</Link>
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );

  if (embedded) {
    return (
      <section
        id="pricing"
        ref={rootRef}
        className="landing-section landing-decorated scroll-mt-6"
        aria-labelledby="pricing-title"
      >
        {content}
      </section>
    );
  }

  return (
    <div ref={rootRef} className="pricing-page min-h-screen py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {content}
    </div>
  );
}
