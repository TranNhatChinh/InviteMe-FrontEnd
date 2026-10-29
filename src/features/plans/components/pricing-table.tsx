"use client";

import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
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

type ComparisonCell = boolean | string;

// Labels are translation keys under pricing.comparison.* in the "plans" namespace.
const COMPARISON_ROWS: {
  category: string;
  items: { name: string; free: ComparisonCell; basic: ComparisonCell; premium: ComparisonCell }[];
}[] = [
  {
    category: "scale",
    items: [
      { name: "guestPlaces", free: "guests50", basic: "guests300", premium: "guests1000" },
      { name: "photos", free: "photos10", basic: "photos60", premium: "photos200" },
      { name: "retention", free: "retention7d", basic: "retention6m", premium: "retention2y" },
      { name: "customSlug", free: false, basic: true, premium: true },
      { name: "removeBranding", free: false, basic: true, premium: true },
    ],
  },
  {
    category: "invitations",
    items: [
      { name: "templates", free: "templatesStandard", basic: "templatesAllPremium", premium: "templatesAllPremium" },
      { name: "emailInvites", free: "email50", basic: "email600", premium: "email2000" },
      { name: "smsInvites", free: "none", basic: "sms100", premium: "sms500" },
      { name: "reminders", free: "none", basic: "reminders2", premium: "unlimited" },
      { name: "aiThankYou", free: "none", basic: "ai1", premium: "ai5" },
    ],
  },
  {
    category: "reception",
    items: [
      { name: "seating", free: "tablesMax5", basic: "tablesUnlimited", premium: "tablesUnlimited" },
      { name: "seatLookup", free: false, basic: true, premium: true },
      { name: "checkin", free: false, basic: true, premium: true },
      { name: "coHosts", free: "ownerOnly", basic: "coHosts2", premium: "coHosts10" },
      { name: "giftQr", free: false, basic: true, premium: true },
      { name: "giftExport", free: false, basic: true, premium: true },
    ],
  },
];

const FAQ_KEYS = ["billing", "upgrade", "payment", "retention"] as const;

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
  const { t } = useTranslation("plans");
  const [showComparison, setShowComparison] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const plansQuery = useQuery({
    queryKey: ["public-plans"],
    queryFn: ({ signal }) => getPublicPlans(api, signal),
    staleTime: 60_000,
  });

  const plans =
    plansQuery.data && plansQuery.data.length > 0
      ? plansQuery.data
      : FALLBACK_PLANS.map((plan) => ({ ...plan, name: t(`pricing.fallbackName.${plan.code}`, { defaultValue: plan.name }) }));

  const renderCell = (value: ComparisonCell, checkClassName: string) =>
    typeof value === "boolean" ? (
      value ? <Check className={`size-4 ${checkClassName} mx-auto`} /> : <Minus className="size-4 text-muted-foreground/40 mx-auto" />
    ) : (
      t(`pricing.comparison.values.${value}`, { defaultValue: value })
    );

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
          {t("pricing.hero.eyebrow")}
        </p>
        <h2 id="pricing-title" className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal tracking-tight text-foreground">
          {t("pricing.hero.title")}
        </h2>
        <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
          <Trans t={t} i18nKey="pricing.hero.subtitle" components={{ strong: <strong /> }} />
        </p>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-1.5 text-xs text-muted-foreground shadow-sm mt-2">
          <ShieldCheck className="size-4 text-emerald-600" />
          <span>{t("pricing.hero.badge")}</span>
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
                    {t("pricing.card.popular")}
                  </span>
                </div>
              )}
              {isVip && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-3.5 py-1 text-xs font-semibold text-white shadow-sm">
                    <Zap className="size-3" />
                    {t("pricing.card.vip")}
                  </span>
                </div>
              )}

              {/* Tên gói & Giá */}
              <div className="border-b border-border/60 pb-6 mb-6">
                <h3 className="font-serif text-2xl font-normal text-foreground">{plan.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 min-h-[32px]">
                  {plan.code === "FREE"
                    ? t("pricing.card.tagline.FREE")
                    : plan.code === "BASIC"
                      ? t("pricing.card.tagline.BASIC")
                      : t("pricing.card.tagline.PREMIUM")}
                </p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground font-serif">
                    {plan.price === 0 ? t("pricing.card.freePrice") : formatCurrency(plan.price, "vi")}
                  </span>
                  <span className="text-xs text-muted-foreground font-normal">{t("pricing.card.perWedding")}</span>
                </div>
              </div>

              {/* Danh sách đặc quyền */}
              <ul className="space-y-3.5 text-sm flex-1 mb-8">
                <li className="flex items-start gap-3 text-foreground font-medium">
                  <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  <span>
                    <Trans t={t} i18nKey="pricing.card.guestPlaces" values={{ value: plan.limits.guestPlaces ?? t("pricing.card.unlimited") }} components={{ strong: <strong /> }} />
                  </span>
                </li>
                <li className="flex items-start gap-3 text-foreground">
                  <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  <span>
                    <Trans t={t} i18nKey="pricing.card.mediaImages" values={{ value: plan.limits.mediaImages ?? t("pricing.card.unlimited") }} components={{ strong: <strong /> }} />
                  </span>
                </li>
                <li className="flex items-start gap-3 text-foreground">
                  <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  <span>
                    <Trans t={t} i18nKey="pricing.card.emailInvites" values={{ value: plan.limits.emailInvites ?? t("pricing.card.unlimited") }} components={{ strong: <strong /> }} />
                  </span>
                </li>

                {plan.limits.smsInvites ? (
                  <li className="flex items-start gap-3 text-foreground">
                    <Check className="size-4 shrink-0 text-primary mt-0.5" />
                    <span>
                      <Trans t={t} i18nKey="pricing.card.smsInvites" values={{ value: plan.limits.smsInvites }} components={{ strong: <strong /> }} />
                    </span>
                  </li>
                ) : (
                  <li className="flex items-start gap-3 text-muted-foreground/60 line-through">
                    <Minus className="size-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                    <span>{t("pricing.card.noSms")}</span>
                  </li>
                )}

                {plan.limits.coHosts ? (
                  <li className="flex items-start gap-3 text-foreground">
                    <Check className="size-4 shrink-0 text-primary mt-0.5" />
                    <span>
                      <Trans t={t} i18nKey="pricing.card.coHosts" values={{ value: plan.limits.coHosts }} components={{ strong: <strong /> }} />
                    </span>
                  </li>
                ) : (
                  <li className="flex items-start gap-3 text-muted-foreground/60 line-through">
                    <Minus className="size-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                    <span>{t("pricing.card.noCoHosts")}</span>
                  </li>
                )}

                <li className="flex items-start gap-3 text-foreground">
                  <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  <span>
                    {t("pricing.card.seatingLabel")}{" "}
                    <strong>
                      {plan.limits.seatingTables
                        ? t("pricing.card.seatingTables", { count: plan.limits.seatingTables })
                        : t("pricing.card.seatingUnlimited")}
                    </strong>
                  </span>
                </li>

                <li className={`flex items-start gap-3 ${plan.limits.checkin ? "text-foreground" : "text-muted-foreground/60 line-through"}`}>
                  {plan.limits.checkin ? (
                    <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  ) : (
                    <Minus className="size-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                  )}
                  <span>{t("pricing.card.checkin")}</span>
                </li>

                <li className={`flex items-start gap-3 ${plan.limits.giftQr ? "text-foreground" : "text-muted-foreground/60 line-through"}`}>
                  {plan.limits.giftQr ? (
                    <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  ) : (
                    <Minus className="size-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                  )}
                  <span>{t("pricing.card.giftQr")}</span>
                </li>

                <li className={`flex items-start gap-3 ${plan.limits.customSlug ? "text-foreground" : "text-muted-foreground/60 line-through"}`}>
                  {plan.limits.customSlug ? (
                    <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  ) : (
                    <Minus className="size-4 shrink-0 text-muted-foreground/40 mt-0.5" />
                  )}
                  <span>{t("pricing.card.customSlug")}</span>
                </li>

                <li className="flex items-start gap-3 text-foreground">
                  <Check className="size-4 shrink-0 text-primary mt-0.5" />
                  <span>
                    {t("pricing.card.retentionLabel")}{" "}
                    <strong>
                      {plan.limits.publicLinkDaysAfterWedding === 7
                        ? t("pricing.card.retention7d")
                        : plan.limits.publicLinkDaysAfterWedding === 183
                          ? t("pricing.card.retention6m")
                          : t("pricing.card.retention2y")}
                    </strong>
                  </span>
                </li>
              </ul>

              {/* Nút hành động */}
              <div className="pt-2">
                {plan.code === "FREE" ? (
                  <Button asChild variant="outline" className="w-full rounded-full py-5 text-sm font-medium">
                    <Link href={startHref}>{startHref === "/register" ? t("pricing.card.startFree") : t("pricing.card.goToWorkspace")}</Link>
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
                      <span>{t("pricing.card.choosePlan", { name: plan.name })}</span>
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
            <h3 className="font-serif text-2xl font-normal text-foreground">{t("pricing.comparison.title")}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t("pricing.comparison.subtitle")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowComparison(!showComparison)}
            className="rounded-full gap-2 text-xs"
          >
            <span>{showComparison ? t("pricing.comparison.collapse") : t("pricing.comparison.expand")}</span>
            {showComparison ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </div>

        {showComparison && (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-foreground">
                  <th className="py-3 px-4 font-semibold w-2/5">{t("pricing.comparison.feature")}</th>
                  <th className="py-3 px-4 font-semibold text-center w-1/5">{t("pricing.fallbackName.FREE")}</th>
                  <th className="py-3 px-4 font-semibold text-center w-1/5 text-primary">{t("pricing.fallbackName.BASIC")}</th>
                  <th className="py-3 px-4 font-semibold text-center w-1/5 text-amber-600">{t("pricing.fallbackName.PREMIUM")}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((section, idx) => (
                  <tr key={idx} className="contents">
                    <td colSpan={4} className="bg-muted/40 font-semibold px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">
                      {t(`pricing.comparison.categories.${section.category}`)}
                    </td>
                    {section.items.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4 text-foreground font-medium">{t(`pricing.comparison.rows.${row.name}`)}</td>
                        <td className="py-3 px-4 text-center text-muted-foreground">
                          {renderCell(row.free, "text-emerald-600")}
                        </td>
                        <td className="py-3 px-4 text-center font-medium text-foreground">
                          {renderCell(row.basic, "text-primary")}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-foreground">
                          {renderCell(row.premium, "text-amber-600")}
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
              {t("pricing.faq.title")}
            </h2>
            <div className="space-y-4">
              {FAQ_KEYS.map((faqKey, index) => {
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
                      <span className="font-serif text-base">{t(`pricing.faq.${faqKey}.q`)}</span>
                      {isOpen ? <ChevronUp className="size-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-4 shrink-0 text-muted-foreground" />}
                    </button>
                    {isOpen && (
                      <p className="mt-3 text-sm text-muted-foreground leading-relaxed animate-in fade-in duration-200">
                        {t(`pricing.faq.${faqKey}.a`)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-amber-500/10 p-8 sm:p-12 text-center max-w-4xl mx-auto shadow-sm space-y-4">
            <h2 className="font-serif text-2xl sm:text-3xl text-foreground font-normal">
              {t("pricing.cta.title")}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
              {t("pricing.cta.subtitle")}
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
              <Button asChild className="rounded-full px-8 h-12 font-semibold shadow-md">
                <Link href={startHref}>
                  {t("pricing.cta.start")} <ArrowRight className="size-4 ml-1" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full px-6 h-12">
                <Link href="/#templates">{t("pricing.cta.templates")}</Link>
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
