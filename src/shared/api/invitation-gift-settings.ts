import { z } from "zod";
export const giftSettingsSchema = z
  .object({
    mode: z.enum(["UPLOADED", "LINKED", "MANUAL"]),
    recipients: z
      .array(
        z
          .object({
            role: z.enum(["BRIDE", "GROOM"]),
            enabled: z.boolean(),
            imageUrl: z
              .string()
              .refine((source) => source.startsWith("/media/") || /^https?:\/\//.test(source))
              .optional(),
            accountId: z.uuid().optional(),
            bankBin: z.string().max(6).optional(),
            accountNumber: z.string().max(30).optional(),
            accountName: z.string().max(100).optional(),
          })
          .strict(),
      )
      .max(2),
  })
  .strict()
  .superRefine((gift, ctx) => {
    if (
      new Set(gift.recipients.map((r) => r.role)).size !== gift.recipients.length ||
      gift.recipients.some(
        (r) =>
          (gift.mode === "UPLOADED" && r.accountId !== undefined) ||
          (gift.mode === "LINKED" && r.imageUrl !== undefined) ||
          (gift.mode === "MANUAL" && (r.accountId !== undefined || r.imageUrl !== undefined)) ||
          (gift.mode !== "MANUAL" &&
            (r.bankBin !== undefined ||
              r.accountNumber !== undefined ||
              r.accountName !== undefined)),
      )
    )
      ctx.addIssue({ code: "custom", message: "Cấu hình hộp quà không hợp lệ." });
  });
export type GiftSettings = z.infer<typeof giftSettingsSchema>;

export function validManualGiftRecipient(r: GiftSettings["recipients"][number]) {
  return /^\d{6}$/.test(r.bankBin ?? "") && /^\d{4,30}$/.test(r.accountNumber ?? "");
}
export function manualGiftQrUrl(bankBin: string, accountNumber: string, accountName: string = "") {
  const name = accountName
    .trim()
    .replaceAll("đ", "d")
    .replaceAll("Đ", "D")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
  return `https://img.vietqr.io/image/${bankBin}-${accountNumber}-compact.png${name ? `?accountName=${encodeURIComponent(name)}` : ""}`;
}
