"use client";
import { createContext, useContext, type ReactNode } from "react";
import { Modal } from "@/shared/ui/modal";
export const GiftPreviewContext = createContext<ReactNode>(null);
export function GiftPreview() {
  return useContext(GiftPreviewContext) ?? <p>Chọn hộp quà mừng để cấu hình mã QR.</p>;
}
export function ImportedGiftPreview({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Hộp quà mừng">
      {open && <GiftPreview />}
    </Modal>
  );
}
