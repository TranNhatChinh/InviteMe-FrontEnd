"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "@/shared/ui/button";

type DetectedCode = { rawValue: string };
type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement) => Promise<DetectedCode[]>;
};
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance;

export function QrCameraScanner({
  disabled = false,
  autoStart = false,
  onDetected,
}: {
  disabled?: boolean;
  autoStart?: boolean;
  onDetected: (value: string) => void;
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
    <div className="mx-auto w-full max-w-2xl space-y-3">
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
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
      {active && (
        <div className="space-y-2 rounded-xl border bg-muted/40 p-2">
          <div className="relative overflow-hidden rounded-lg bg-zinc-950">
            <video
              ref={videoRef}
              className="aspect-video max-h-[26rem] w-full object-cover"
              muted
              playsInline
              aria-label={t("videoAria")}
            />
            <div
              className="pointer-events-none absolute inset-0 grid place-items-center"
              aria-hidden="true"
            >
              <div className="h-[58%] w-[48%] rounded-2xl border-2 border-white/80" />
            </div>
          </div>
          <p className="px-2 py-1 text-center text-sm text-muted-foreground">{t("hint")}</p>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
        >
          {error}
        </p>
      )}
    </div>
  );
}
