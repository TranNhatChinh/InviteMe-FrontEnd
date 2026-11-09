"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1768611260730-0e0704e084cc?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D";

export function PublicLandingHero() {
  const { t } = useTranslation("landing");

  return (
    <section className="wedding-hero" aria-labelledby="hero-heading">
      <div className="wedding-hero__copy-stack">
        <div className="wedding-hero__copy wedding-hero__copy--dark">
          <p className="wedding-hero__eyebrow">
            <span />
            {t("heroEyebrow")}
          </p>
          <h1 id="hero-heading" className="wedding-hero__title">
            {t("heroTitleFirst")} <span>{t("heroTitleSecond")}</span>
          </h1>
          <p className="wedding-hero__description">{t("heroDescription")}</p>
          <div className="wedding-hero__actions">
            <Link href="/register" className="wedding-hero__primary-cta">
              {t("heroPrimary")} <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <a href="#features" className="wedding-hero__secondary-cta">
              {t("heroSecondary")}
            </a>
          </div>
          <p className="wedding-hero__note">{t("heroNote")}</p>
        </div>
      </div>
      <div className="wedding-hero__visual wedding-hero__visual--reference">
        <div className="wedding-hero__film">
          <div className="wedding-hero__media">
            <Image src={HERO_IMAGE} alt={t("demoCouple")} fill priority unoptimized />
          </div>
        </div>
        <div className="wedding-hero__invitation" aria-hidden="true">
          <span className="wedding-hero__invite-kicker">{t("demoInviteKicker")}</span>
          <span className="wedding-hero__couple">Minh &amp; Lan</span>
          <span className="wedding-hero__invite-rule" />
          <span className="wedding-hero__invite-date">18 · 10 · 2026</span>
          <p>
            {t("demoInviteLine1")}
            <br />
            {t("demoInviteLine2")}
          </p>
          <span className="wedding-hero__invite-signature">{t("demoInviteSignature")}</span>
        </div>
        <div className="wedding-hero__card-edge" aria-hidden="true" />
        {["left", "back", "front"].map((layer) => (
          <div
            key={layer}
            className={`reference-botanical reference-botanical--${layer}`}
            aria-hidden="true"
          >
            <div className="reference-botanical__slice">
              <Image
                src="/images/hero/reference-botanical-v1.webp"
                alt=""
                fill
                unoptimized
                sizes="900px"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
