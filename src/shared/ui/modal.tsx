"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { trapDialogFocus } from "@/shared/lib/dialog-focus";
import { Button } from "./button";
import { useTranslation } from "react-i18next";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "default",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "default" | "wide";
}) {
  const { t } = useTranslation("common");
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onKeyDown={trapDialogFocus}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
      className={`fixed inset-0 m-auto ${size === "wide" ? "max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-[1440px] rounded-2xl sm:w-[calc(100%-2rem)]" : "max-h-[85dvh] w-[calc(100%-2rem)] max-w-3xl rounded-2xl"} overflow-hidden border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40 open:flex open:flex-col`}
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-foreground/10 px-5 py-4">
        <div>
          <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
            {title}
          </h2>
          {description && (
            <p id={`${id}-description`} className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={t("closeDialogTitle", { title: title.toLocaleLowerCase() })}
          onClick={onClose}
        >
          <X className="size-5" />
        </Button>
      </header>
      <div className={`min-h-0 overflow-y-auto ${size === "wide" ? "p-3 sm:p-4" : "p-5"}`}>
        {children}
      </div>
    </dialog>
  );
}
