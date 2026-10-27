"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  Heart,
  Monitor,
  Send,
  Users,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { SampleSite } from "./sample-site";
import { StoryCover } from "./story-cover";
import { useTranslation } from "react-i18next";

const templates = [
  {
    id: "invite" as const,
    titleKey: "inviteTitle",
    textKey: "inviteText",
  },
  {
    id: "story" as const,
    titleKey: "storyTitle",
    textKey: "storyText",
  },
];

function SectionBotanicals() {
  return (
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
  );
}

const questions = [
  ["faqAccountQuestion", "faqAccountAnswer"],
  ["faqGuestListQuestion", "faqGuestListAnswer"],
  ["faqPricingQuestion", "faqPricingAnswer"],
  ["faqTemplateQuestion", "faqTemplateAnswer"],
  ["faqDemoQuestion", "faqDemoAnswer"],
  ["faqLinkQuestion", "faqLinkAnswer"],
] as const;

export function LandingContent({ pricingSection }: { pricingSection?: ReactNode }) {
  const { t } = useTranslation("landing");
  return (
    <div className="landing-content">
      <section id="templates" className="landing-section" aria-labelledby="template-title">
        <div className="landing-heading">
          <p className="landing-eyebrow">{t("templateEyebrow")}</p>
          <h2 id="template-title">{t("templateHeading")}</h2>
          <p>{t("templateDescription")}</p>
        </div>
        <div className="landing-template-grid">
          {templates.map((template) => (
            <article className="landing-template" key={template.id}>
              <div className="landing-template__preview">
                {template.id === "story" ? (
                  <StoryCover />
                ) : (
                  <div className="landing-category-image">
                    <Image
                      src={
                        template.id === "invite"
                          ? "/images/template-studio/collection/photo-garden.webp"
                          : "/images/templates/story-meadow.png"
                      }
                      alt={template.id === "invite" ? t("weddingInviteAlt") : t("weddingStoryAlt")}
                      fill
                      sizes="(max-width: 640px) 90vw, 550px"
                    />
                    <span className="landing-category-image__label">
                      {template.id === "invite" ? t("invitationCategory") : t("storyCategory")}
                    </span>
                  </div>
                )}
              </div>
              <div className="landing-template__body">
                <h3>{t(template.titleKey)}</h3>
                <p>{t(template.textKey)}</p>
                <div className="landing-actions">
                  <Link className="landing-button" href={`/templates/${template.id}`}>
                    {template.id === "invite" ? t("viewInvitations") : t("viewStories")}{" "}
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="landing-caption">{t("templateCaption")}</p>
      </section>

      <section id="features" className="landing-section" aria-labelledby="feature-title">
        <div className="landing-heading">
          <p className="landing-eyebrow">{t("prepareTogether")}</p>
          <h2 id="feature-title">{t("momentsHeading")}</h2>
          <p>{t("momentsDescription")}</p>
        </div>
        <div className="landing-feature-grid">
          <article className="landing-feature">
            <div className="landing-feature__visual">
              <div className="mini-website">
                <SampleSite layout="invite" />
              </div>
            </div>
            <div className="landing-feature__body">
              <Monitor />
              <h3>{t("weddingWebsite")}</h3>
              <p>{t("weddingWebsiteDescription")}</p>
              <span>{t("sampleInterface")}</span>
            </div>
          </article>
          <article className="landing-feature">
            <div className="landing-feature__visual">
              <div className="mini-rsvp">
                <Heart size={20} />
                <h4>{t("willYouAttend")}</h4>
                <span className="mini-rsvp__selected">
                  <Check size={14} /> {t("attending")}
                </span>
                <span>{t("declining")}</span>
                <div className="sample-site__pill">{t("sendResponse")}</div>
              </div>
            </div>
            <div className="landing-feature__body">
              <Send />
              <h3>RSVP</h3>
              <p>{t("rsvpDescription")}</p>
              <span>{t("sampleInterface")}</span>
            </div>
          </article>
          <article className="landing-feature">
            <div className="landing-feature__visual">
              <div className="mini-guests">
                <h4>{t("guestList")}</h4>
                <div className="mini-guests__head">
                  {t("sampleGuest")} <span>{t("status")}</span>
                </div>
                {[t("guestA"), t("guestB"), t("guestC")].map((name, i) => (
                  <div key={name}>
                    <span className="mini-guests__avatar">{name.slice(-1)}</span>
                    {name}
                    <span className={i === 2 ? "pending" : "confirmed"}>
                      {i === 2 ? t("awaitingResponse") : t("attendStatus")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="landing-feature__body">
              <Users />
              <h3>{t("guestManagement")}</h3>
              <p>{t("guestManagementDescription")}</p>
              <span>{t("hostOnlySample")}</span>
            </div>
          </article>
        </div>
      </section>

      <section
        id="guide"
        className="landing-section landing-decorated"
        aria-labelledby="guide-title"
      >
        <SectionBotanicals />
        <div className="landing-heading">
          <p className="landing-eyebrow">{t("guideEyebrow")}</p>
          <h2 id="guide-title">{t("guideHeading")}</h2>
          <p>{t("guideDescription")}</p>
        </div>
        <div className="landing-step-grid">
          {[
            {
              Icon: Heart,
              title: t("chooseTemplate"),
              text: t("chooseTemplateText"),
            },
            {
              Icon: CalendarDays,
              title: t("addDetails"),
              text: t("addDetailsText"),
            },
            {
              Icon: Copy,
              title: t("shareLink"),
              text: t("shareLinkText"),
            },
          ].map(({ Icon, title, text }, i) => (
            <article className="landing-step" key={title}>
              <span className="landing-step__number">0{i + 1}</span>
              <Icon className="landing-step__icon" strokeWidth={1.2} />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Vị trí bảng giá dịch vụ */}
      {pricingSection}

      <section
        id="faq"
        className="landing-section landing-faq landing-decorated"
        aria-labelledby="faq-title"
      >
        <SectionBotanicals />
        <div className="landing-heading">
          <p className="landing-eyebrow">{t("faqEyebrow")}</p>
          <h2 id="faq-title">{t("faqHeading")}</h2>
        </div>
        {questions.map(([questionKey, answerKey], i) => (
          <details key={questionKey} open={i === 0}>
            <summary>
              {t(questionKey)}
              <ChevronDown size={18} />
            </summary>
            <p>{t(answerKey)}</p>
          </details>
        ))}
      </section>

      <section className="landing-section landing-closing">
        <SectionBotanicals />
        <p className="landing-eyebrow">{t("closingEyebrow")}</p>
        <h2>{t("closingHeading")}</h2>
        <p>{t("closingDescription")}</p>
        <Link className="landing-button" href="/login">
          {t("heroPrimary")} <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}
