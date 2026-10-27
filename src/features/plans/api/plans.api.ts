import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";

export const planLimitsSchema = z.object({
  guestPlaces: z.number().nullable().default(0),
  mediaImages: z.number().nullable().default(0),
  emailInvites: z.number().nullable().default(0),
  smsInvites: z.number().nullable().default(0),
  reminderRounds: z.number().nullable().default(0),
  coHosts: z.number().nullable().default(0),
  seatingTables: z.number().nullable().default(0),
  checkin: z.boolean().default(false),
  giftQr: z.boolean().default(false),
  giftExport: z.boolean().default(false),
  aiThankYouRuns: z.number().nullable().default(0),
  premiumTemplates: z.boolean().default(false),
  brandingBadge: z.boolean().default(true),
  customSlug: z.boolean().default(false),
  publicLinkDaysAfterWedding: z.number().nullable().default(0),
  publicSeatLookup: z.boolean().default(false),
  retentionDaysAfterWedding: z.number().nullable().default(0),
});
export type PlanLimits = z.infer<typeof planLimitsSchema>;

export const planDtoSchema = z.object({
  code: z.string(),
  name: z.string(),
  price: z.number(),
  currency: z.string(),
  limits: planLimitsSchema,
});
export type PlanDto = z.infer<typeof planDtoSchema>;

export const weddingPlanUsageSchema = z.object({
  guestPlaces: z.number().default(0),
  mediaImages: z.number().default(0),
  emailInvites: z.number().default(0),
  smsInvites: z.number().default(0),
  reminderRounds: z.number().default(0),
  coHosts: z.number().default(0),
  seatingTables: z.number().default(0),
  aiThankYouRuns: z.number().default(0),
});
export type WeddingPlanUsage = z.infer<typeof weddingPlanUsageSchema>;

export const weddingPlanDtoSchema = z.object({
  weddingId: z.string(),
  planCode: z.string(),
  planName: z.string(),
  legacy: z.boolean().default(false),
  limits: planLimitsSchema,
  usage: weddingPlanUsageSchema,
  publicLinkUntil: z.string().nullable(),
});
export type WeddingPlanDto = z.infer<typeof weddingPlanDtoSchema>;

export const planOrderDtoSchema = z.object({
  id: z.string(),
  weddingId: z.string().nullable(),
  planCode: z.string(),
  planName: z.string(),
  code: z.string(),
  amount: z.number(),
  paidAmount: z.number(),
  status: z.enum(["PENDING", "PAID", "CANCELLED", "EXPIRED"]),
  bankBin: z.string(),
  bankName: z.string(),
  accountNumber: z.string(),
  accountName: z.string(),
  qrImageUrl: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  paidAt: z.string().nullable(),
});
export type PlanOrderDto = z.infer<typeof planOrderDtoSchema>;

// Public API
export function getPublicPlans(api: ApiClient, signal?: AbortSignal) {
  return api.request("/plans", {
    auth: "none",
    signal,
    schema: z.array(planDtoSchema),
  });
}

// Host API
export function getWeddingPlan(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(`/weddings/${encodeURIComponent(weddingId)}/plan`, {
    signal,
    schema: weddingPlanDtoSchema,
  });
}

export function createPlanOrder(api: ApiClient, weddingId: string, planCode: string) {
  return api.request(`/weddings/${encodeURIComponent(weddingId)}/plan-orders`, {
    method: "POST",
    body: { planCode },
    schema: planOrderDtoSchema,
  });
}

export function getWeddingPlanOrders(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(`/weddings/${encodeURIComponent(weddingId)}/plan-orders`, {
    signal,
    schema: z.array(planOrderDtoSchema),
  });
}

export function getWeddingPlanOrder(
  api: ApiClient,
  weddingId: string,
  orderId: string,
  signal?: AbortSignal,
) {
  return api.request(
    `/weddings/${encodeURIComponent(weddingId)}/plan-orders/${encodeURIComponent(orderId)}`,
    {
      signal,
      schema: planOrderDtoSchema,
    },
  );
}

export function cancelPlanOrder(api: ApiClient, weddingId: string, orderId: string) {
  return api.request(
    `/weddings/${encodeURIComponent(weddingId)}/plan-orders/${encodeURIComponent(orderId)}/cancel`,
    {
      method: "POST",
      body: {},
      schema: planOrderDtoSchema,
    },
  );
}

export function simulatePlanPayment(
  api: ApiClient,
  weddingId: string,
  orderId: string,
  amount?: number,
) {
  return api.request(
    `/weddings/${encodeURIComponent(weddingId)}/plan-orders/${encodeURIComponent(orderId)}/dev/simulate-payment`,
    {
      method: "POST",
      body: { amount },
      schema: z.object({
        status: z.string(),
        reason: z.string().nullable(),
        activated: z.boolean(),
        replayed: z.boolean(),
      }),
    },
  );
}
