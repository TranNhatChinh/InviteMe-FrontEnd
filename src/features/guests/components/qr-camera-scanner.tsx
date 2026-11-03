"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, CameraOff, QrCode } from "lucide-react";
import { Button } from "@/shared/ui/button";
import styles from "./seat-lookup-counter.module.css";

type DetectedCode = { rawValue: string };
type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement) => Promise<DetectedCode[]>;
};
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance;

export function QrCameraScanner({
  disabled = false,
  autoStart = false,
  onDetected,
  className,
}: {
  disabled?: boolean;
  autoStart?: boolean;
  onDetected: (value: string) => void;
  className?: string;
}) {
  const { t } = useTranslation("guests", { keyPrefix: "reception.camera" });
  const [active, setActive] = useState(autoStart);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let stream: MediaStream | undefined;
    let timer: number | undefined;

    const stop = () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    async function start() {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
        .BarcodeDetector;
      if (!Detector) {
        setError(t("unsupported"));
        setActive(false);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t("unavailable"));
        setActive(false);
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const detector = new Detector({ formats: ["qr_code"] });

        const scan = async () => {
          if (disposed) return;
          try {
            const result = (await detector.detect(video)).find((item) => item.rawValue.trim());
            if (result) {
              setActive(false);
              onDetectedRef.current(result.rawValue);
              return;
            }
          } catch {
            // Camera frames can briefly fail while autofocus is adjusting.
          }
          if (!disposed) timer = window.setTimeout(() => void scan(), 180);
        };
        void scan();
      } catch (cause) {
        if (disposed) return;
        const name = cause instanceof Error ? cause.name : "";
        setError(name === "NotAllowedError" ? t("permission") : t("openFailed"));
        setActive(false);
      }
    }

    void start();
    return stop;
  }, [active, t]);

  return (
    <div className={`${styles.cameraScanner} ${className ?? ""}`}>
      <div className={styles.cameraViewport} data-active={active}>
        {active ? (
          <video
            ref={videoRef}
            className={styles.cameraVideo}
            muted
            playsInline
            aria-label={t("videoAria")}
          />
        ) : (
          <div className={styles.cameraIdle}>
            <QrCode aria-hidden="true" />
            <p>{t("idle")}</p>
          </div>
        )}
        {active && (
          <div className={styles.scanFrame} aria-hidden="true">
            <span data-corner="top-left" />
            <span data-corner="top-right" />
            <span data-corner="bottom-left" />
            <span data-corner="bottom-right" />
            <span className={styles.scanLine} />
          </div>
        )}
        <span className={styles.cameraStatus} data-active={active}>
          <span aria-hidden="true" />
          {active ? t("active") : t("ready")}
        </span>
      </div>
      <div className={styles.cameraControls}>
        <Button
          type="button"
          variant={active ? "outline" : "default"}
          className={styles.cameraToggle}
          disabled={disabled}
          onClick={() => {
            setError("");
            setActive((value) => !value);
          }}
          aria-pressed={active}
        >
          {active ? <CameraOff aria-hidden="true" /> : <Camera aria-hidden="true" />}
          {active ? t("off") : t("on")}
        </Button>
        <p className={styles.cameraHint}>{t("hint")}</p>
      </div>
      {error && (
        <p role="alert" className={styles.cameraError}>
          {error}
        </p>
      )}
    </div>
  );
}
