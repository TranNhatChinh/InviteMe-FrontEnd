import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";

const bank = z.object({
  id: z.string(),
  bankBin: z.string(),
  bankName: z.string(),
  accountNumber: z.string(),
  accountName: z.string(),
  label: z.string().nullable(),
});
const guestGift = z.object({
  id: z.string(),
  code: z.string().nullable(),
  amount: z.number().nullable(),
  status: z.string(),
  message: z.string().nullable(),
  messagePublic: z.boolean(),
  account: bank.nullable(),
  qrImageUrl: z.string().nullable(),
  transferContent: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  paidAt: z.string().nullable(),
  notice: z.string().nullable(),
});
export const guestGiftPageSchema = z.object({
  recipientName: z.string(),
  weddingTitle: z.string(),
  accounts: z.array(bank),
  suggestedAmounts: z.array(z.number()),
  minAmount: z.number(),
  maxAmount: z.number(),
  myGifts: z.array(guestGift),
});
export type GuestGiftPage = z.infer<typeof guestGiftPageSchema>;
export type GuestGift = z.infer<typeof guestGift>;
export const giftSummarySchema = z.object({
  totalReceived: z.number(),
  receivedCount: z.number(),
  qrTotal: z.number(),
  qrCount: z.number(),
  cashTotal: z.number(),
  cashCount: z.number(),
  transferTotal: z.number(),
  transferCount: z.number(),
  waiting: z.number(),
  claimed: z.number(),
  expired: z.number(),
  amountMismatches: z.number(),
  needsReview: z.number(),
  accounts: z.number(),
});
export type GiftSummary = z.infer<typeof giftSummarySchema>;
export const giftLedgerSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      guestId: z.string().nullable(),
      giverName: z.string(),
      method: z.string(),
      status: z.string(),
      confirmation: z.string().nullable(),
      code: z.string().nullable(),
      amountExpected: z.number().nullable(),
      amountReceived: z.number().nullable(),
      amountMismatch: z.boolean(),
      message: z.string().nullable(),
      messagePublic: z.boolean(),
      accountId: z.string().nullable(),
      createdAt: z.string(),
      claimedAt: z.string().nullable(),
      paidAt: z.string().nullable(),
    }),
  ),
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
});
export type GiftLedger = z.infer<typeof giftLedgerSchema>;
const host = (id: string) => `/weddings/${encodeURIComponent(id)}/gifts`;
export function getGiftAccounts(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(`${host(weddingId)}/accounts`, { signal, schema: z.array(bank) });
}
export function getGiftBanks(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(`${host(weddingId)}/banks`, {
    signal,
    schema: z.array(z.object({ bin: z.string(), name: z.string() })),
  });
}
export function addGiftAccount(
  api: ApiClient,
  weddingId: string,
  body: { bankBin: string; accountNumber: string; accountName: string; label?: string },
) {
  return api.request(`${host(weddingId)}/accounts`, { method: "POST", body, schema: bank });
}
export function removeGiftAccount(api: ApiClient, weddingId: string, accountId: string) {
  return api.request(`${host(weddingId)}/accounts/${encodeURIComponent(accountId)}`, {
    method: "DELETE",
    schema: z.undefined(),
  });
}
export function getGiftSummary(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(`${host(weddingId)}/summary`, { signal, schema: giftSummarySchema });
}
export function getGiftLedger(
  api: ApiClient,
  weddingId: string,
  page: number,
  search = "",
  signal?: AbortSignal,
) {
  return api.request(
    `${host(weddingId)}?${new URLSearchParams({ page: String(page), pageSize: "25", search })}`,
    { signal, schema: giftLedgerSchema },
  );
}
export function confirmGift(api: ApiClient, weddingId: string, giftId: string) {
  return api.request(`${host(weddingId)}/${encodeURIComponent(giftId)}/confirm`, {
    method: "POST",
    body: {},
    schema: z.unknown(),
  });
}
export function createGuestGift(
  api: ApiClient,
  token: string,
  body: { amount: number; message?: string; accountId?: string; messagePublic: boolean },
  key: string,
) {
  return api.request(`/gifts/${encodeURIComponent(token)}`, {
    method: "POST",
    auth: "none",
    headers: { "Idempotency-Key": key },
    body,
    schema: guestGift,
  });
}
export function getGuestGiftPage(api: ApiClient, token: string, signal?: AbortSignal) {
  return api.request(`/gifts/${encodeURIComponent(token)}`, {
    auth: "none",
    signal,
    schema: guestGiftPageSchema,
  });
}
export function claimGuestGift(api: ApiClient, token: string, id: string) {
  return api.request(`/gifts/${encodeURIComponent(token)}/${encodeURIComponent(id)}/claim`, {
    method: "POST",
    auth: "none",
    schema: guestGift,
  });
}

// ---------- reception desk (owner or co-host with GIFT_RECORD) ----------

export const receptionGiftSchema = z.object({
  id: z.string(),
  guestId: z.string().nullable(),
  giverName: z.string(),
  method: z.string(),
  status: z.string(),
  amountExpected: z.number().nullable(),
  amountReceived: z.number().nullable(),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
  itemName: z.string().nullable().optional(),
  itemQuantity: z.number().nullable().optional(),
  itemValue: z.number().nullable().optional(),
  hasProof: z.boolean().optional(),
});
export type ReceptionGift = z.infer<typeof receptionGiftSchema>;

export type RecordGiftInput =
  | { method: "CASH"; amount?: number; guestId?: string; giverName?: string }
  | { method: "TRANSFER"; amount: number; proofId?: string; guestId?: string; giverName?: string }
  | {
      method: "ITEM";
      itemName: string;
      quantity?: number;
      estimatedValue?: number;
      guestId?: string;
      giverName?: string;
    };

export function getReceptionGifts(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(`${host(weddingId)}/reception`, {
    signal,
    schema: z.array(receptionGiftSchema),
  });
}

/** Recorded on the desk screen: a transfer there waits for the couple to confirm, whoever records it. */
export function recordGift(api: ApiClient, weddingId: string, body: RecordGiftInput, key: string) {
  return api.request(host(weddingId), {
    method: "POST",
    body: { ...body, fromDesk: true },
    headers: { "Idempotency-Key": key },
    schema: receptionGiftSchema,
  });
}

/** Photo of the guest's transfer screen; its id goes in RecordGiftInput.proofId. */
export function uploadGiftProof(api: ApiClient, weddingId: string, image: File) {
  const body = new FormData();
  body.set("image", image);
  return api.request(`${host(weddingId)}/proofs`, {
    method: "POST",
    body,
    schema: z.object({ id: z.string() }),
  });
}

export function cancelGift(api: ApiClient, weddingId: string, giftId: string) {
  return api.request(`${host(weddingId)}/${encodeURIComponent(giftId)}/cancel`, {
    method: "POST",
    schema: receptionGiftSchema,
  });
}

/** Invitations found at the desk (needs CHECKIN_MANAGE); contact details are never returned. */
export function searchDeskGuests(
  api: ApiClient,
  weddingId: string,
  query: string,
  signal?: AbortSignal,
) {
  return api.request(
    `/weddings/${encodeURIComponent(weddingId)}/guest-planning/reception/search?${new URLSearchParams({ q: query })}`,
    {
      signal,
      schema: z.array(
        z.object({
          guestId: z.string(),
          recipientName: z.string(),
          honorific: z.string().nullable(),
          side: z.string(),
        }),
      ),
    },
  );
}
