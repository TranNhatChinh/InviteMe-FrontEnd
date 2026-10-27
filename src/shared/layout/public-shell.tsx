"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/shared/components/brand-logo";
import { useTranslation } from "react-i18next";
import { PublicNavigation } from "./public-navigation";

export function PublicShell({ children, account }: { children: ReactNode; account?: ReactNode }) {
  const { t: tPublic } = useTranslation("public");
  const { t: tNavigation } = useTranslation("navigation");
  return (
    <div className="public-shell">
      <PublicNavigation account={account} />
      <main id="main-content" className="public-main">
        {children}
      </main>
      <footer className="public-footer">
        <div className="public-footer__top">
          <BrandLogo
            href="/"
            size="sm"
            className="public-footer__brand"
            ariaLabel={`InviteMe — ${tNavigation("home")}`}
          />
          <nav aria-label={tPublic("footerNavigation")} className="public-footer__links">
            <Link href="/templates">{tPublic("templates")}</Link>
            <Link href="/#pricing">{tPublic("pricing")}</Link>
            <Link href="/#guide">{tPublic("guide")}</Link>
            <Link href="/#faq">{tPublic("faq")}</Link>
            <Link href="/#contact">{tPublic("contact")}</Link>
            <Link href="/terms">{tPublic("terms")}</Link>
            <Link href="/privacy">{tPublic("privacy")}</Link>
          </nav>
        </div>
        <div id="contact" className="public-footer__support">
          <strong>{tPublic("contactSupport")}</strong>
          <p>{tPublic("supportPending")}</p>
        </div>
        <div className="public-footer__bottom">
          <p>{tPublic("tagline")}</p>
          <p>{tPublic("previewNotice")}</p>
        </div>
      </footer>
    </div>
  );
}
