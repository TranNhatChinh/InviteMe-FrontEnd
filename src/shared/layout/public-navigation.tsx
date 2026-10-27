"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandLogo } from "@/shared/components/brand-logo";
import { LanguageSwitcher } from "@/shared/components/language-switcher";
import { useTranslation } from "react-i18next";

const links = [
  { href: "/templates", namespace: "public", key: "templates" },
  { href: "/#features", namespace: "public", key: "features" },
  { href: "/#pricing", namespace: "public", key: "pricing" },
  { href: "/#guide", namespace: "public", key: "guide" },
] as const;

export function PublicNavigation({ account }: { account?: ReactNode }) {
  const { t } = useTranslation(["public", "auth"]);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeMenu() {
      setOpen(false);
    }
    window.addEventListener("popstate", closeMenu);
    return () => window.removeEventListener("popstate", closeMenu);
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    function handlePointerDown(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <header ref={headerRef} className="public-nav" data-open={open}>
      <div className="public-nav__inner">
        <BrandLogo
          href="/"
          size="lg"
          className="public-nav__brand"
          ariaLabel={`${"InviteMe"} — ${t("home", { ns: "navigation" })}`}
        />
        <button
          ref={toggleRef}
          type="button"
          className="public-nav__toggle"
          aria-label={open ? t("closeMenu", { ns: "public" }) : t("openMenu", { ns: "public" })}
          aria-expanded={open}
          aria-controls="public-navigation-links"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <nav
          id="public-navigation-links"
          aria-label={t("mainNavigation", { ns: "navigation" })}
          className="public-nav__links"
        >
          {links.map(({ href, namespace, key }) => (
            <Link
              key={href}
              href={href}
              aria-current={href === pathname ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {t(key, { ns: namespace })}
            </Link>
          ))}
          <LanguageSwitcher className="public-nav__language" />
          {account}
        </nav>
      </div>
    </header>
  );
}
