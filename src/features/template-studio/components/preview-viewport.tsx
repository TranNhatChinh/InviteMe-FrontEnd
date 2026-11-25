"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, BatteryFull, Monitor, Signal, Smartphone, Wifi } from "lucide-react";
import styles from "./preview-viewport.module.css";

export function PreviewViewport({
  active,
  children,
  toolbar,
  embedded = false,
}: {
  active: boolean;
  children: ReactNode;
  toolbar?: ReactNode;
  embedded?: boolean;
}) {
  const [mobile, setMobile] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [scale, setScale] = useState(1);
  const area = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!active) return;
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    const syncStyles = () => {
      doc.head.replaceChildren(
        ...Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]')).map((node) =>
          node.cloneNode(true),
        ),
      );
      doc.documentElement.className = document.documentElement.className;
      doc.documentElement.lang = document.documentElement.lang;
      doc.body.className = document.body.className;
      doc.body.style.margin = "0";
      const scrollStyle = doc.createElement("style");
      scrollStyle.textContent = `
        * { scrollbar-width: thin; scrollbar-color: #00000035 transparent; scrollbar-gutter: auto; }
        @supports selector(::-webkit-scrollbar) {
          * { scrollbar-width: auto; scrollbar-color: auto; }
          ::-webkit-scrollbar { width: 4px; height: 4px; }
          ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #00000035; border-radius: 99px; }
          ::-webkit-scrollbar-thumb:hover { background: #00000055; }
          ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
        }
      `;
      doc.head.append(scrollStyle);
    };
    syncStyles();
    setTarget(doc.body);
    const observer = new MutationObserver(syncStyles);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    if (!active || !area.current) return;
    const element = area.current;
    const observer = new ResizeObserver(() => {
      setScale(
        Math.max(
          0.1,
          Math.min(780 / 889, (element.clientWidth - 24) / 428, (element.clientHeight - 132) / 889),
        ),
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [active]);

  if (!active) return children;
  return (
    <div className={`${styles.preview} ${embedded ? styles.embedded : ""}`}>
      {toolbar}
      <div className={styles.viewport}>
        <div className={styles.switch} role="group" aria-label="Thiết bị xem trước">
          <button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>
            <Monitor size={16} /> Máy tính
          </button>
          <button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>
            <Smartphone size={16} /> Điện thoại
          </button>
        </div>
        <div ref={area} className={styles.area} data-mobile={mobile}>
          <div
            className={styles.device}
            style={mobile ? { width: 428 * scale, height: 889 * scale } : undefined}
          >
            <div
              className={styles.shell}
              style={mobile ? { transform: `scale(${scale})` } : undefined}
            >
              <span className={styles.silentButton} aria-hidden="true" />
              <span className={styles.volumeButtons} aria-hidden="true" />
              <span className={styles.powerButton} aria-hidden="true" />
              <div className={styles.screen}>
                <div className={styles.statusBar} aria-hidden="true">
                  <span className={styles.time}>9:41</span>
                  <span className={styles.island} />
                  <span className={styles.statusIcons}>
                    <Signal />
                    <Wifi />
                    <BatteryFull />
                  </span>
                </div>
                <iframe
                  ref={frame}
                  allow="autoplay"
                  title="Xem trước thiệp"
                  className={styles.frame}
                />
                {target && createPortal(children, target)}
              </div>
            </div>
          </div>
          {mobile && (
            <button type="button" className={styles.desktopLink} onClick={() => setMobile(false)}>
              <Monitor size={14} />
              <span>Xem giao diện trên máy tính</span>
              <ArrowUpRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
