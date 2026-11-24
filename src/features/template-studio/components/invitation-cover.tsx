"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./invitation-cover.module.css";
import { resolveCoverGreeting } from "./wording-text";
export type CoverConfig = {
  enabled: boolean;
  names: string;
  greeting?: string;
  greetingBinding?: "invitationWording";
  date: string;
  background: string;
  style?: "floral" | "traditional" | "botanical";
  particles?: "none" | "hearts" | "leaves" | "happiness";
  opening?: "seal" | "fly" | "fade";
  decoration?: string;
};
export function InvitationCover({
  config,
  recipientLabel,
  onOpen,
  editing = false,
  onStart,
}: {
  config: CoverConfig;
  recipientLabel?: string | null;
  onOpen: () => void;
  editing?: boolean;
  onStart?: () => void;
}) {
  const [opening, setOpening] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completed = useRef(false);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function finish() {
    if (completed.current) return;
    completed.current = true;
    if (timer.current) clearTimeout(timer.current);
    onOpen();
  }
  function start() {
    if (opening || editing) return;
    onStart?.();
    setOpening(true);
    timer.current = setTimeout(finish, 1500);
  }
  const variant = config.style ?? "floral";
  return (
    <section
      aria-label="Bìa thiệp"
      data-opening={opening ? "true" : "false"}
      className={styles.cover}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        background: `radial-gradient(ellipse at top left, ${config.background}, color-mix(in srgb, ${config.background}, black 40%))`,
        display: "grid",
        placeItems: "center",
        padding: 24,
        overflow: "auto",
      }}
    >
      <div
        className={`${styles.card} ${opening ? styles.opening : ""}`}
        data-mode={config.opening ?? "seal"}
        data-style={variant}
        onAnimationEnd={(event) => {
          if (opening && event.target === event.currentTarget) finish();
        }}
        style={{
          width: "min(100%, 420px)",
          position: "relative",
          background: variant === "traditional" ? config.background : "#faf3e8",
          color: variant === "traditional" ? "#f5dfb1" : config.background,
          borderRadius: 12,
          padding: "36px 24px",
          textAlign: "center",
          boxShadow: "0 18px 50px #21060b66",
          fontFamily: "EB Garamond, Georgia, serif",
          overflow: "hidden",
        }}
      >
        {variant === "traditional" && (
          <>
            <span className={styles.symbolLeft} aria-hidden="true">
              囍
            </span>
            <span className={styles.symbolRight} aria-hidden="true">
              囍
            </span>
          </>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={config.decoration ?? "/images/template-studio/minimalism-burgundy/botanical.svg"}
          alt=""
          style={{
            position: "absolute",
            left: -25,
            top: 12,
            width: 110,
            height: 245,
            pointerEvents: "none",
            opacity: variant === "traditional" ? 0 : 0.65,
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={config.decoration ?? "/images/template-studio/minimalism-burgundy/botanical.svg"}
          alt=""
          style={{
            position: "absolute",
            right: -25,
            top: 12,
            width: 110,
            height: 245,
            transform: "scaleX(-1)",
            pointerEvents: "none",
            opacity: variant === "traditional" ? 0 : 0.65,
          }}
        />
        <div style={{ position: "relative" }}>
          <span
            className={styles.seal}
            style={{
              display: "inline-grid",
              placeItems: "center",
              border: "1px solid #c6aa78",
              borderRadius: "50%",
              width: 56,
              height: 56,
              color: "#b38b4c",
              fontSize: 26,
            }}
          >
            {variant === "traditional" ? "囍" : "♡"}
            {opening && <span className={styles.ring} />}
          </span>
          <h2
            style={{
              fontSize: 38,
              fontWeight: 400,
              lineHeight: 1.2,
              whiteSpace: "pre-line",
              margin: "24px 0",
            }}
          >
            {config.names}
          </h2>
          <p
            style={{
              fontSize: 20,
              margin: "22px 0",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {resolveCoverGreeting(recipientLabel)}
          </p>
          <button
            onClick={start}
            disabled={opening || editing}
            aria-busy={opening}
            className={styles.button}
            style={{
              background: variant === "traditional" ? "#f5dfb1" : config.background,
              color: variant === "traditional" ? config.background : "#faf3e8",
              border: 0,
              borderRadius: 40,
              padding: "12px 32px",
              fontSize: 20,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {opening ? "Đang mở…" : "Mở thiệp"}
          </button>
        </div>
      </div>
    </section>
  );
}
