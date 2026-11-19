"use client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GuestRsvp } from "@/features/rsvp";
import { Modal } from "@/shared/ui/modal";

export function GuestRsvpOverlay({ token }: { token: string }) {
  const { t } = useTranslation("invitations", { keyPrefix: "imported" });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = (event: Event) => {
      if ((event as CustomEvent<{ token?: string }>).detail?.token === token) setOpen(true);
    };
    window.addEventListener("inviteme:open-rsvp", show);
    return () => window.removeEventListener("inviteme:open-rsvp", show);
  }, [token]);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title={t("defaultRsvp")} size="small">
      {open && <GuestRsvp token={token} embedded />}
    </Modal>
  );
}
