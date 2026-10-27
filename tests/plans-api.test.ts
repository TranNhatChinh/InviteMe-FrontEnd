import assert from "node:assert/strict";
import test from "node:test";
import type { ApiClient } from "@/core/api/api-client";
import {
  getPublicPlans,
  getWeddingPlan,
  createPlanOrder,
  planLimitsSchema,
  weddingPlanDtoSchema,
  planOrderDtoSchema,
} from "@/features/plans";
import { adminApi } from "@/features/admin/api/admin.api";

test("plans schema validates limits, prices and feature flags", () => {
  const freeLimits = planLimitsSchema.parse({
    guestPlaces: 50,
    mediaImages: 10,
    emailInvites: 50,
    brandingBadge: true,
    customSlug: false,
  });
  assert.equal(freeLimits.guestPlaces, 50);
  assert.equal(freeLimits.brandingBadge, true);
  assert.equal(freeLimits.customSlug, false);

  const premiumLimits = planLimitsSchema.parse({
    guestPlaces: 1000,
    mediaImages: 200,
    emailInvites: 2000,
    brandingBadge: false,
    customSlug: true,
    checkin: true,
    giftQr: true,
  });
  assert.equal(premiumLimits.guestPlaces, 1000);
  assert.equal(premiumLimits.brandingBadge, false);
  assert.equal(premiumLimits.customSlug, true);
  assert.equal(premiumLimits.checkin, true);
});

test("getPublicPlans requests /plans anonymously and validates returned plan catalog", async () => {
  let requestedPath = "";
  let requestOptions: Record<string, unknown> = {};

  const mockPlans = [
    {
      code: "FREE",
      name: "Miễn phí",
      price: 0,
      currency: "VND",
      limits: { guestPlaces: 50, brandingBadge: true },
    },
    {
      code: "BASIC",
      name: "Cơ bản",
      price: 299000,
      currency: "VND",
      limits: { guestPlaces: 300, brandingBadge: false, checkin: true },
    },
    {
      code: "PREMIUM",
      name: "Cao cấp",
      price: 699000,
      currency: "VND",
      limits: { guestPlaces: 1000, brandingBadge: false, checkin: true, customSlug: true },
    },
  ];

  const api = {
    request: async (path: string, options: Record<string, unknown>) => {
      requestedPath = path;
      requestOptions = options;
      return mockPlans;
    },
  } as unknown as ApiClient;

  const result = await getPublicPlans(api);
  assert.equal(requestedPath, "/plans");
  assert.equal(requestOptions.auth, "none");
  assert.equal(result.length, 3);
  const [first, second, third] = result;
  assert.equal(first?.code, "FREE");
  assert.equal(second?.price, 299000);
  assert.equal(third?.code, "PREMIUM");
});

test("getWeddingPlan validates wedding usage against limits", async () => {
  let requestedPath = "";

  const mockWeddingPlan = {
    weddingId: "11111111-1111-1111-1111-111111111111",
    planCode: "BASIC",
    planName: "Cơ bản",
    legacy: false,
    limits: {
      guestPlaces: 300,
      mediaImages: 60,
      emailInvites: 600,
      brandingBadge: false,
    },
    usage: {
      guestPlaces: 142,
      mediaImages: 25,
      emailInvites: 110,
      smsInvites: 0,
      reminderRounds: 0,
      coHosts: 1,
      seatingTables: 15,
      aiThankYouRuns: 0,
    },
    publicLinkUntil: null,
  };

  const api = {
    request: async (path: string) => {
      requestedPath = path;
      return weddingPlanDtoSchema.parse(mockWeddingPlan);
    },
  } as unknown as ApiClient;

  const result = await getWeddingPlan(api, "11111111-1111-1111-1111-111111111111");
  assert.equal(requestedPath, "/weddings/11111111-1111-1111-1111-111111111111/plan");
  assert.equal(result.planCode, "BASIC");
  assert.equal(result.usage.guestPlaces, 142);
  assert.equal(result.limits.guestPlaces, 300);
});

test("createPlanOrder sends planCode and receives VietQR payment details", async () => {
  let requestedPath = "";
  let requestMethod = "";
  let requestBody: unknown = null;

  const mockOrder = {
    id: "order-123",
    weddingId: "11111111-1111-1111-1111-111111111111",
    planCode: "PREMIUM",
    planName: "Cao cấp",
    code: "IM99ABC",
    amount: 699000,
    paidAmount: 0,
    status: "PENDING" as const,
    bankBin: "970422",
    bankName: "MBBank",
    accountNumber: "0987654321",
    accountName: "CONG TY INVITEME",
    qrImageUrl: "https://img.vietqr.io/image/970422-0987654321-compact2.png?amount=699000&addInfo=IM99ABC",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    paidAt: null,
  };

  const api = {
    request: async (path: string, options: { method?: string; body?: unknown }) => {
      requestedPath = path;
      requestMethod = options.method ?? "GET";
      requestBody = options.body;
      return planOrderDtoSchema.parse(mockOrder);
    },
  } as unknown as ApiClient;

  const result = await createPlanOrder(api, "11111111-1111-1111-1111-111111111111", "PREMIUM");
  assert.equal(requestedPath, "/weddings/11111111-1111-1111-1111-111111111111/plan-orders");
  assert.equal(requestMethod, "POST");
  assert.deepEqual(requestBody, { planCode: "PREMIUM" });
  assert.equal(result.code, "IM99ABC");
  assert.equal(result.amount, 699000);
  assert.ok(result.qrImageUrl?.includes("IM99ABC"));
});

test("adminApi executes admin plan management operations", async () => {
  let requestedPath = "";
  let requestMethod = "";
  let requestBody: unknown = null;

  const api = {
    request: async (path: string, options?: { method?: string; body?: unknown }) => {
      requestedPath = path;
      requestMethod = options?.method ?? "GET";
      requestBody = options?.body;
      if (path.startsWith("/admin/plans/orders/grant") || path.startsWith("/admin/weddings/")) {
        return {
          weddingId: "wedding-1",
          planCode: "PREMIUM",
          planName: "Cao cấp",
          legacy: false,
          limits: { guestPlaces: 1000 },
        };
      }
      if (path.startsWith("/admin/plan-orders/order-1/approve")) {
        return {
          id: "order-1",
          planCode: "BASIC",
          code: "IM0123",
          amount: 299000,
          paidAmount: 299000,
          status: "COMPLETED",
          createdAt: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
        };
      }
      return [];
    },
  } as unknown as ApiClient;

  await adminApi.approvePlanOrder(api, "order-1", "Duyệt thủ công");
  assert.equal(requestedPath, "/admin/plan-orders/order-1/approve");
  assert.equal(requestMethod, "POST");
  assert.deepEqual(requestBody, { note: "Duyệt thủ công" });

  await adminApi.grantWeddingPlan(api, "wedding-1", { planCode: "PREMIUM", note: "Tặng gói VIP" });
  assert.equal(requestedPath, "/admin/weddings/wedding-1/plan");
  assert.equal(requestMethod, "PUT");
  assert.deepEqual(requestBody, { planCode: "PREMIUM", note: "Tặng gói VIP" });
});
