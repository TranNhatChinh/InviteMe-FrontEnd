"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowUpFromLine, ChevronLeft, ChevronRight, DoorOpen, Snowflake } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CoverConfig } from "../components/invitation-cover";
import type { ParticleEffect } from "../components/particle-settings";
import styles from "./effects-panel.module.css";

export function EffectsPanel({
  children,
  cover,
  disabled,
  onCoverChange,
  onOpenCover,
  particles,
  onParticlesChange,
}: {
  children: ReactNode;
  cover?: CoverConfig;
  disabled: boolean;
  onCoverChange: (patch: Partial<CoverConfig>) => void;
  onOpenCover: () => void;
  particles: ParticleEffect;
  onParticlesChange: (effect: ParticleEffect) => void;
}) {
  const { t } = useTranslation("templateStudio");
  const [section, setSection] = useState<"motion" | "opening" | "falling" | null>(null);
  const lastParticleEffect = useRef<ParticleEffect>("hearts");
  return (
    <div className={styles.panel}>
      {section ? (
        <>
          <button type="button" className={styles.back} onClick={() => setSection(null)}>
            <ChevronLeft size={14} />
            {t("categories.effects")}
          </button>
          <h2>{t(`effectsPanel.${section}`)}</h2>
          {section === "motion" ? (
            children
          ) : (
            <fieldset disabled={disabled} className={styles.controls}>
              {section === "falling" ? (
                <>
                  <label className={styles.visibility}>
                    <span>{t("effectsPanel.showOnInvitation")}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={particles !== "none"}
                      onChange={(event) => {
                        if (!event.target.checked && particles !== "none") {
                          lastParticleEffect.current = particles;
                        }
                        onParticlesChange(event.target.checked ? lastParticleEffect.current : "none");
                      }}
                    />
                  </label>
                  <div className={styles.effectLabel}>{t("effectsPanel.effectType")}</div>
                  <div className={styles.effectGrid} role="group" aria-label={t("library.backgroundEffect")}>
                    {([
                      ["hearts", "♥️"],
                      ["leaves", "🍃"],
                      ["happiness", "囍"],
                    ] as const).map(([effect, icon]) => (
                      <button
                        key={effect}
                        type="button"
                        className={styles.effectOption}
                        aria-pressed={particles === effect}
                        onClick={() => {
                          lastParticleEffect.current = effect;
                          onParticlesChange(effect);
                        }}
                      >
                        <span className={styles.effectIcon} aria-hidden="true">{icon}</span>
                        <span>{t(`library.${effect}`)}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : cover?.enabled ? (
                <>
                  <p>{t("effectsPanel.coverScope")}</p>

                  <label>
                    {t("library.openingAnimation")}
                    <select
                      value={cover.opening ?? "seal"}
                      onChange={(event) =>
                        onCoverChange({ opening: event.target.value as CoverConfig["opening"] })
                      }
                    >
                      <option value="seal">{t("library.sealOpening")}</option>
                      <option value="fly">{t("library.flyOpening")}</option>
                      <option value="fade">{t("library.fadeOpening")}</option>
                    </select>
                  </label>
                </>
              ) : (
                <p>{t("effectsPanel.enableCover")}</p>
              )}
              {section === "opening" && (
                <button type="button" onClick={onOpenCover}>
                  {t("library.cover")}
                </button>
              )}
            </fieldset>
          )}
        </>
      ) : (
        <>
          <h2>{t("categories.effects")}</h2>
          <p>{t("effectsPanel.help")}</p>
          <div className={styles.cards}>
            {(
              [
                ["motion", ArrowUpFromLine],
                ["opening", DoorOpen],
                ["falling", Snowflake],
              ] as const
            ).map(([id, Icon]) => (
              <button key={id} type="button" className={styles.card} onClick={() => setSection(id)}>
                <span className={styles.icon}>
                  <Icon size={18} strokeWidth={1.7} />
                </span>
                <span className={styles.copy}>
                  <strong>{t(`effectsPanel.${id}`)}</strong>
                  <small>{t(`effectsPanel.${id}Help`)}</small>
                </span>
                <ChevronRight size={14} className={styles.chevron} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
