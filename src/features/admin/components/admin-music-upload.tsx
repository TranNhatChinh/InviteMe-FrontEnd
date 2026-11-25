"use client";

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileAudio, UploadCloud, X } from "lucide-react";
import { Button } from "@/shared/ui/button";

export function AdminMusicUpload({
  file,
  disabled,
  label,
  required,
  submitted,
  onChange,
  onError,
}: {
  file?: File;
  disabled: boolean;
  label: string;
  required: boolean;
  submitted: boolean;
  onChange: (file?: File) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation("admin");
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [draggingFile, setDraggingFile] = useState(false);
  const fileValid =
    !file || (/\.mp3$/i.test(file.name) && file.size > 0 && file.size <= 20 * 1024 * 1024);
  function selectFile(selected?: File) {
    onChange(selected);
    if (fileInput.current) fileInput.current.value = "";
  }
  return (
    <div className="grid gap-2 text-sm">
      <span id="music-file-label">
        {label} {required && "*"}
      </span>
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        accept=".mp3,audio/mpeg"
        disabled={disabled}
        aria-labelledby="music-file-label"
        onChange={(event) => selectFile(event.target.files?.[0])}
      />
      <div
        role="group"
        aria-labelledby="music-file-label"
        aria-describedby="music-file-help"
        aria-busy={disabled}
        className={`flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-5 py-6 text-center transition-colors ${draggingFile ? "border-primary bg-primary/10" : file && !fileValid ? "border-destructive/50 bg-destructive/5" : "border-primary/30 bg-primary/5"} ${disabled ? "opacity-60" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (disabled || !event.dataTransfer.types.includes("Files")) return;
          dragDepth.current++;
          setDraggingFile(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = disabled ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDraggingFile(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDraggingFile(false);
          if (disabled) return;
          if (event.dataTransfer.files.length !== 1) {
            onError(t("music.singleFile"));
            return;
          }
          selectFile(event.dataTransfer.files[0]);
        }}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background text-primary shadow-sm">
          {file ? (
            <FileAudio size={24} aria-hidden="true" />
          ) : (
            <UploadCloud size={24} aria-hidden="true" />
          )}
        </div>
        {file ? (
          <div className="flex w-full min-w-0 items-center justify-center gap-2" aria-live="polite">
            <div className="min-w-0">
              <p className="break-all font-medium">{file.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0"
              disabled={disabled}
              aria-label={t("music.removeFile")}
              onClick={() => selectFile()}
            >
              <X size={16} />
            </Button>
          </div>
        ) : (
          <div>
            <p className="font-medium">{t(draggingFile ? "music.dropNow" : "music.dropFile")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("music.fileFormats")}</p>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="bg-background"
          onClick={() => fileInput.current?.click()}
        >
          <UploadCloud size={16} aria-hidden="true" />
          {t(file ? "music.chooseAnother" : "music.chooseFile")}
        </Button>
      </div>
      <span id="music-file-help" className="text-xs text-muted-foreground">
        {t("music.fileHelp")}
      </span>
      {!required && !file && (
        <span className="text-xs text-muted-foreground">{t("music.keepFile")}</span>
      )}
      {((file && !fileValid) || (submitted && !file && required)) && (
        <span role="alert" className="text-destructive">
          {t(file && file.size > 20 * 1024 * 1024 ? "music.fileSize" : "music.fileInvalid")}
        </span>
      )}
    </div>
  );
}
