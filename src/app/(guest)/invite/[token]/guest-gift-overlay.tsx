"use client";
import { useEffect, useState } from "react";
import { GuestGiftPanel } from "@/features/gifts";
import { useTranslation } from "react-i18next";
import { Modal } from "@/shared/ui/modal";

export function GuestGiftOverlay({ token }: { token: string }) {
  const { t } = useTranslation("guests");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<{ token?: string }>).detail;
      if (!detail?.token || detail.token === token) setOpen(true);
    };
    window.addEventListener("inviteme:open-gift", show);
    return () => window.removeEventListener("inviteme:open-gift", show);
  }, [token]);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title={t("sendGift")}>
      {open && <GuestGiftPanel token={token} />}
    </Modal>
  );
}
