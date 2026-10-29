"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/shared/ui/modal";

const BANK_HUB_ORIGIN = "https://bankhub.sepay.vn";

/** Events SePay's hosted page posts to the window that frames it. */
type BankHubEvent =
  | "FINISHED_BANK_ACCOUNT_LINK"
  | "FINISHED_BANK_ACCOUNT_UNLINK"
  | "BANKHUB_CLOSE_LINK"
  | "BANKHUB_TOKEN_EXPIRED"
  | "BANKHUB_SESSION_EXPIRED";

/**
 * SePay Bank Hub page in a dialog: the couple picks their bank and confirms with the bank's OTP there; InviteMe never sees
 * their bank login. Calls onFinished when SePay reports a link/unlink, so the app can read the linked accounts again.
 */
export function BankHubLinkDialog({
  url,
  mode,
  onClose,
  onFinished,
}: {
  url: string | null;
  mode: "link" | "unlink";
  onClose: () => void;
  onFinished: () => void;
}) {
  const { t } = useTranslation("gifts");
  // Expiry belongs to one link: a new link starts fresh.
  const [expiredUrl, setExpiredUrl] = useState<string | null>(null);
  const expired = url !== null && expiredUrl === url;
  useEffect(() => {
    if (!url) return;
    const listen = (message: MessageEvent) => {
      if (message.origin !== BANK_HUB_ORIGIN) return;
      const data = typeof message.data === "string" ? safeParse(message.data) : message.data;
      const event =
        data && typeof data === "object" && "event" in data ? (data.event as BankHubEvent) : null;
      if (event === "FINISHED_BANK_ACCOUNT_LINK" || event === "FINISHED_BANK_ACCOUNT_UNLINK")
        onFinished();
      else if (event === "BANKHUB_CLOSE_LINK") onClose();
      else if (event === "BANKHUB_TOKEN_EXPIRED" || event === "BANKHUB_SESSION_EXPIRED")
        setExpiredUrl(url);
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [url, onClose, onFinished]);
  return (
    <Modal
      open={url !== null}
      onClose={onClose}
      title={mode === "link" ? t("bankHub.linkTitle") : t("bankHub.unlinkTitle")}
      description={t("bankHub.dialogHint")}
    >
      {expired ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {t("bankHub.expired")}
        </p>
      ) : (
        url && (
          <iframe
            src={url}
            title={t("bankHub.frameTitle")}
            className="h-[min(640px,65dvh)] w-full rounded-lg border-0 bg-white"
            allow="clipboard-write"
          />
        )
      )}
    </Modal>
  );
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
