"use client";

import { useState } from "react";
import { ImagePlus, Palette } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ItemProps } from "../components/items";
import styles from "./background-panel.module.css";

const colors = [
  "transparent",
  "#000000",
  "#666666",
  "#999999",
  "#cccccc",
  "#ffffff",
  "#c0392b",
  "#8e44ad",
  "#2980b9",
  "#16a085",
  "#27ae60",
  "#e67e22",
  "#e74c3c",
  "#9b59b6",
  "#3498db",
  "#1abc9c",
  "#2ecc71",
  "#f39c12",
  "#ffb6c1",
  "#e6e6fa",
  "#87ceeb",
  "#98fb98",
  "#bfff00",
  "#ffdab9",
  "#ffd1dc",
  "#bde8ff",
  "#c1dfc1",
  "#c8a2c8",
  "#fff5b7",
  "#ffb39e",
  "#ffe4e1",
  "#ccccff",
  "#99ff99",
  "#e6b3ff",
  "#ffffcc",
  "#ffe5b4",
];
const gradients: [string, string][] = [
  ["#ff6b6b", "#ff8e53"],
  ["#4481eb", "#8e54b9"],
  ["#43cea2", "#4481eb"],
  ["#38ef7d", "#32e6b1"],
  ["#dcecb6", "#afe8da"],
  ["#ff758c", "#ffdab9"],
  ["#6200ea", "#a349f4"],
  ["#bd168f", "#ef57a7"],
  ["#007eaa", "#00bcd4"],
  ["#ffa000", "#ffd600"],
  ["#23b8de", "#5796ff"],
  ["#ab67ed", "#cc93fa"],
];
const gradient = (start: string, end: string) => `linear-gradient(135deg, ${start}, ${end})`;

export function BackgroundPanel({
  value,
  disabled,
  onChange,
  onUpload,
}: {
  value: ItemProps;
  disabled: boolean;
  onChange: (patch: Partial<ItemProps>) => void;
  onUpload?: (file: File) => Promise<{ src: string; name: string }>;
}) {
  const { t } = useTranslation("templateStudio");
  const [tab, setTab] = useState("color");
  const [customGradient, setCustomGradient] = useState(false);
  const [ends, setEnds] = useState<[string, string]>(["#ff6b6b", "#ff8e53"]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const background = value.background ?? "#fffaf1";
  const current = value.src ? `url(${value.src})` : (value.backgroundGradient ?? background);
  const currentLabel = value.src
    ? t("backgroundPanel.image")
    : value.backgroundGradient
      ? "Gradient"
      : t("backgroundPanel.solid");

  async function upload(file?: File) {
    if (!file || uploading) return;
    setUploading(true);
    setError("");
    try {
      let image: { src: string };
      if (onUpload) {
        image = await onUpload(file);
      } else {
        const data = new FormData();
        data.append("file", file);
        const response = await fetch("/api/template-studio/assets", { method: "POST", body: data });
        if (!response.ok) throw new Error("Upload failed");
        image = await response.json();
      }
      onChange({ src: image.src, backgroundGradient: undefined });
    } catch {
      setError(t("status.imageUploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <fieldset className={styles.panel} disabled={disabled || uploading}>
      <h2>{t("categories.background")}</h2>
      <div className={styles.current}>
        <span
          className={styles.currentSwatch}
          style={{ background: current, backgroundSize: "cover" }}
        />
        <div>
          <small>{t("backgroundPanel.current")}</small>
          <strong>{currentLabel}</strong>
          <small>
            {value.src
              ? t("backgroundPanel.image")
              : value.backgroundGradient
                ? "Gradient"
                : background.toUpperCase()}
          </small>
        </div>
      </div>
      <div className={styles.tabs} role="tablist" aria-label={t("categories.background")}>
        {[
          ["color", t("backgroundPanel.color")],
          ["image", t("backgroundPanel.image")],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`background-${id}`}
            id={`background-tab-${id}`}
            onClick={() => setTab(id ?? "color")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "color" ? (
        <div id="background-color" role="tabpanel" aria-labelledby="background-tab-color">
          <div className={styles.sectionTitle}>
            <span>{t("backgroundPanel.solid")}</span>
            <label className={styles.custom}>
              <input
                type="color"
                aria-label={t("backgroundPanel.customColor")}
                value={/^#[0-9a-f]{6}$/i.test(background) ? background : "#ffffff"}
                onChange={(event) =>
                  onChange({
                    background: event.target.value,
                    backgroundGradient: undefined,
                    src: undefined,
                  })
                }
              />
              {t("backgroundPanel.customColor")}
            </label>
          </div>
          <div className={styles.swatches}>
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                className={styles.swatch}
                aria-label={color === "transparent" ? t("backgroundPanel.transparent") : color}
                aria-pressed={!value.src && !value.backgroundGradient && background === color}
                title={color}
                onClick={() =>
                  onChange({ background: color, backgroundGradient: undefined, src: undefined })
                }
              >
                <span
                  className={color === "transparent" ? styles.checker : undefined}
                  style={{ backgroundColor: color }}
                />
              </button>
            ))}
          </div>
          <div className={styles.sectionTitle}>
            <span>Gradient</span>
            <button
              type="button"
              className={styles.customGradient}
              aria-expanded={customGradient}
              onClick={() => setCustomGradient(!customGradient)}
            >
              <Palette size={13} />
              {t("backgroundPanel.customGradient")}
            </button>
          </div>
          {customGradient && (
            <div className={styles.gradientColors}>
              {ends.map((color, index) => (
                <input
                  key={index}
                  type="color"
                  value={color}
                  aria-label={t(
                    index === 0 ? "backgroundPanel.gradientStart" : "backgroundPanel.gradientEnd",
                  )}
                  onChange={(event) => {
                    const next: [string, string] = [...ends];
                    next[index] = event.target.value;
                    setEnds(next);
                    onChange({ backgroundGradient: gradient(next[0], next[1]), src: undefined });
                  }}
                />
              ))}
            </div>
          )}
          <div className={styles.swatches}>
            {gradients.map(([start, end]) => {
              const fill = gradient(start, end);
              return (
                <button
                  key={fill}
                  type="button"
                  className={styles.swatch}
                  aria-label={fill}
                  aria-pressed={!value.src && value.backgroundGradient === fill}
                  onClick={() => onChange({ backgroundGradient: fill, src: undefined })}
                >
                  <span style={{ background: fill }} />
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div id="background-image" role="tabpanel" aria-labelledby="background-tab-image">
          <label className={styles.upload}>
            <ImagePlus size={24} />
            <span>{uploading ? t("library.loadingImage") : t("library.uploadImage")}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={disabled || uploading}
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          {value.src && (
            <button
              type="button"
              className={styles.remove}
              onClick={() => onChange({ src: undefined })}
            >
              {t("backgroundPanel.removeImage")}
            </button>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </fieldset>
  );
}
