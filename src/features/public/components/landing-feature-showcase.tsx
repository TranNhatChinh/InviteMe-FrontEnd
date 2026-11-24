"use client";

import Image from "next/image";
import Link from "next/link";
import { Armchair, ArrowRight, Check, Gift, Globe, Mail, QrCode, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "./landing-feature-showcase.module.css";

const photo = "/images/template-studio/collection/photo-garden.webp";

function WindowBar({ title }: { title: string }) {
  return (
    <div className={styles.windowBar}>
      <span className={styles.traffic}>
        <i />
        <i />
        <i />
      </span>
      <span>{title}</span>
    </div>
  );
}

export function LandingFeatureShowcase() {
  const { t } = useTranslation("landing", { keyPrefix: "showcase" });
  const checks = ["seats", "sides", "parties", "suggestions"];
  return (
    <section className={styles.section} aria-labelledby="feature-showcase-title">
      <Image
        className={styles.botanical}
        src="/images/hero/botanical-stem-v2.webp"
        width={150}
        height={260}
        alt=""
      />
      <header className={styles.heading}>
        <p className={styles.eyebrow}>
          <span />
          {t("eyebrow")}
          <span />
        </p>
        <h2 id="feature-showcase-title">
          {t("title")} <em>InviteMe</em>
        </h2>
        <p>{t("description")}</p>
      </header>
      <div className={styles.grid}>
        <article className={`${styles.card} ${styles.seating}`}>
          <div className={styles.copy}>
            <span className={styles.icon}>
              <Armchair aria-hidden="true" />
            </span>
            <h3>
              <Link href="/weddings">
                {t("seatingTitle")}
                <ArrowRight />
              </Link>
            </h3>
            <p>{t("seatingDescription")}</p>
            <ul className={styles.checks}>
              {checks.map((key) => (
                <li key={key}>
                  <Check aria-hidden="true" />
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.seatingPreview} aria-label={t("seatingPreview")}>
            <WindowBar title={t("seatingWindow")} />
            <div className={styles.previewToolbar}>
              <Armchair size={11} />
              <strong>{t("seatingWindow")}</strong>
              <span className={styles.sideBlue}>{t("groom")}</span>
              <span className={styles.sidePink}>{t("bride")}</span>
            </div>
            <div className={styles.floor}>
              <div className={styles.stage}>{t("stage")}</div>
              <div className={styles.tables}>
                {Array.from({ length: 12 }, (_, index) => (
                  <div
                    key={index}
                    className={`${styles.table} ${index % 4 > 1 ? styles.pinkTable : ""}`}
                  >
                    <span>B{String(index + 1).padStart(2, "0")}</span>
                    {Array.from({ length: 8 }, (_, seat) => (
                      <i
                        key={seat}
                        style={{ transform: `rotate(${seat * 45}deg) translateY(-20px)` }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <span className={styles.previewCaption}>{t("illustration")}</span>
          </div>
        </article>

        <article className={`${styles.card} ${styles.invitation}`}>
          <div className={styles.copy}>
            <span className={styles.icon}>
              <Mail aria-hidden="true" />
            </span>
            <h3>
              <Link href="/templates/invite">
                {t("invitationTitle")}
                <ArrowRight />
              </Link>
            </h3>
            <p>{t("invitationDescription")}</p>
          </div>
          <div className={styles.invitePreview} aria-label={t("invitationPreview")}>
            <div className={styles.backPaper} />
            <div className={styles.paper}>
              <div className={styles.invitePhoto}>
                <Image src={photo} alt="" fill sizes="220px" />
              </div>
              <p>{t("greeting")}</p>
              <span className={styles.couple}>Minh &amp; An</span>
              <div className={styles.inviteFooter}>
                <span>20 · 12 · 2026</span>
                <QrCode aria-hidden="true" />
              </div>
            </div>
          </div>
        </article>

        <article className={`${styles.card} ${styles.guests}`}>
          <div className={styles.copy}>
            <span className={styles.icon}>
              <Users aria-hidden="true" />
            </span>
            <h3>
              <Link href="/weddings">
                {t("guestsTitle")}
                <ArrowRight />
              </Link>
            </h3>
            <p>{t("guestsDescription")}</p>
          </div>
          <div className={styles.guestPreview}>
            <p>{t("confirmed")}</p>
            <div className={styles.total}>
              <strong>128</strong>
              <span>/ 180 {t("guests")}</span>
            </div>
            <div className={styles.progress}>
              <span />
            </div>
            {[
              ["M", "family", true],
              ["A", "friend", true],
              ["H", "guest", false],
            ].map(([initial, label, attending], index) => (
              <div className={styles.guestRow} key={index}>
                <span className={styles.avatar}>{initial}</span>
                <span>{t(String(label))}</span>
                <span className={attending ? styles.attending : styles.pending}>
                  {t(attending ? "attending" : "pending")}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className={`${styles.card} ${styles.website}`}>
          <div className={styles.copy}>
            <span className={styles.icon}>
              <Globe aria-hidden="true" />
            </span>
            <h3>
              <Link href="/templates/story">
                {t("websiteTitle")}
                <ArrowRight />
              </Link>
            </h3>
            <p>{t("websiteDescription")}</p>
            <ul className={styles.checks}>
              {["story", "album", "events"].map((key) => (
                <li key={key}>
                  <Check aria-hidden="true" />
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.websitePreview}>
            <WindowBar title="inviteme / minh-an" />
            <div className={styles.siteNav}>
              <span>M &amp; A</span>
              <span>
                {t("story")} · {t("album")}
              </span>
            </div>
            <div className={styles.sitePhoto}>
              <Image src={photo} alt="" fill sizes="350px" />
              <div>
                <span>Minh &amp; An</span>
                <p>OUR LOVE STORY</p>
              </div>
            </div>
          </div>
        </article>

        <div className={styles.bottom}>
          <article className={styles.checkin}>
            <span className={styles.icon}>
              <QrCode aria-hidden="true" />
            </span>
            <div className={styles.copy}>
              <h3>
                <Link href="/weddings">
                  {t("checkinTitle")}
                  <ArrowRight />
                </Link>
              </h3>
              <p>{t("checkinDescription")}</p>
            </div>
            <div className={styles.qr}>
              <QrCode aria-hidden="true" />
              <span>{t("qrLabel")}</span>
            </div>
            <ArrowRight className={styles.flowArrow} aria-hidden="true" />
            <div className={styles.checkinResult}>
              <span className={styles.success}>
                <Check aria-hidden="true" />
              </span>
              <strong>{t("checkinSuccess")}</strong>
              <span>{t("guest")}</span>
              <small>{t("tableLabel")}</small>
            </div>
          </article>
          <article className={styles.gifts}>
            <span className={styles.icon}>
              <Gift aria-hidden="true" />
            </span>
            <div className={styles.copy}>
              <h3>
                <Link href="/weddings">
                  {t("giftsTitle")}
                  <ArrowRight />
                </Link>
              </h3>
              <p>{t("giftsDescription")}</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
