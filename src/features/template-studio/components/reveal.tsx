"use client";
import { useEditor, useNode } from "@craftjs/core";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
} from "react";
import styles from "./reveal.module.css";
export const RevealPausedContext = createContext(false);
export type RevealPreset = "none" | "fade" | "slide-up" | "scale-in";
export const RevealReplayContext = createContext({ revision: 0, replay: () => {} });
export function StudioReveal({ render }: { render: ReactElement }) {
  const paused = useContext(RevealPausedContext);
  const { revision } = useContext(RevealReplayContext);
  const wrapper = useRef<HTMLDivElement>(null);
  const { id, props } = useNode((node) => ({ props: node.data.props }));
  const { enabled, globalPreset } = useEditor((state) => ({
    enabled: state.options.enabled,
    globalPreset: state.nodes.ROOT?.data.props.revealPreset ?? "none",
  }));
  const preset = globalPreset;
  const active = !paused && (!enabled || revision > 0) && id !== "ROOT" && preset !== "none";
  useEffect(() => {
    const element = wrapper.current;
    const target = element?.firstElementChild;
    if (!element || !target || !active) return;
    if (
      !("IntersectionObserver" in window) ||
      (!enabled && revision === 0 && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ) {
      element.dataset.visible = "true";
      element.dataset.revealFallback = !("IntersectionObserver" in window)
        ? "no-observer"
        : "reduced-motion";
      return;
    }
    element.dataset.visible = "false";
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          element.dataset.visible = "true";
          observer.disconnect();
        }
      },
      {
        root: target.closest('[aria-label="Khung thiết kế"]'),
        threshold: 0,
        rootMargin: "0px 0px -12px 0px",
      },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [active, preset, revision, enabled]);
  return (
    <div
      ref={wrapper}
      className={styles.wrapper}
      data-reveal={active ? preset : "none"}
      data-explicit={revision > 0 ? "true" : "false"}
      style={
        {
          "--reveal-duration": "800ms",
          "--reveal-delay": "0ms",
          "--reveal-opacity": props.opacity ?? 1,
        } as CSSProperties
      }
    >
      {render}
    </div>
  );
}
