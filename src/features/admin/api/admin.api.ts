import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";
const colors = z.object({ primary: z.string(), background: z.string(), accent: z.string(), text: z.string() });
const storyTemplateConfigSchema = z.object({
  key: z.string(), name: z.string(),
  sections: z.array(z.object({ type: z.string(), variant: z.string() })),
  theme: z.object({ colors, fontHeading: z.string(), fontBody: z.string() }),
  palettes: z.array(z.object({ id: z.string(), label: z.string(), colors })),
  allowedFonts: z.array(z.string()), assets: z.record(z.string(), z.string()).nullable().optional(),
});

export const adminStoryTemplateSchema = z.object({
  id: z.string(), key: z.string(), name: z.string(), version: z.number(),
  publishedVersion: z.number(), draft: storyTemplateConfigSchema,
  published: storyTemplateConfigSchema.nullable(), isArchived: z.boolean(),
  updatedAt: z.string(), publishedAt: z.string().nullable(),
});
export type AdminStoryTemplate = z.infer<typeof adminStoryTemplateSchema>;
export type StoryTemplateConfig = z.infer<typeof storyTemplateConfigSchema>;

export const storyTemplateAdminApi = {
  list: (api: ApiClient) => api.request("/admin/story-templates", { schema: z.array(adminStoryTemplateSchema) }),
  create: (api: ApiClient, key: string, draft: StoryTemplateConfig) =>
    api.request("/admin/story-templates", { method: "POST", body: { key, draft }, schema: adminStoryTemplateSchema }),
  save: (api: ApiClient, id: string, expectedVersion: number, draft: StoryTemplateConfig) =>
    api.request(`/admin/story-templates/${encodeURIComponent(id)}/draft`, {
      method: "PUT", body: { expectedVersion, draft }, schema: adminStoryTemplateSchema,
    }),
  publish: (api: ApiClient, id: string, expectedVersion: number) =>
    api.request(`/admin/story-templates/${encodeURIComponent(id)}/publish`, {
      method: "POST", body: { expectedVersion }, schema: adminStoryTemplateSchema,
    }),
  archive: (api: ApiClient, id: string, expectedVersion: number, archived: boolean) =>
    api.request(`/admin/story-templates/${encodeURIComponent(id)}/${archived ? "archive" : "unarchive"}`, {
      method: "POST", body: { expectedVersion }, schema: adminStoryTemplateSchema,
    }),
};

const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number(),
    pageSize: z.number(),
    totalCount: z.number(),
    totalPages: z.number(),
  });

export const adminDashboardSchema = z.object({
  totalAccounts: z.number(),
  activeAccounts: z.number(),
  suspendedAccounts: z.number(),
  totalWeddings: z.number(),
  draftWeddings: z.number(),
  publishedWeddings: z.number(),
  closedWeddings: z.number(),
  activeGuests: z.number(),
  invitationsSent: z.number(),
});
export type AdminDashboard = z.infer<typeof adminDashboardSchema>;

export const adminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  role: z.enum(["ADMIN", "USER"]),
  status: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type AdminUser = z.infer<typeof adminUserSchema>;
export const adminUsersSchema = pageSchema(adminUserSchema);

export const adminWeddingSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  ownerEmail: z.string(),
  title: z.string(),
  slug: z.string(),
  status: z.string(),
  capacity: z.number().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export const adminWeddingsSchema = pageSchema(adminWeddingSchema);

export const adminTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  theme: z.string().nullable(),
  previewUrl: z.string().nullable(),
  configurationJson: z.string().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "DRAFT"]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type AdminTemplate = z.infer<typeof adminTemplateSchema>;
export const adminTemplatesSchema = pageSchema(adminTemplateSchema);

export const adminPermissionSchema = z.object({
  code: z.string(),
  name: z.string(),
  scope: z.string(),
  description: z.string().nullable(),
  assignable: z.boolean(),
});
export const adminRoleSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string(),
  scope: z.string(),
  permissions: z.array(z.string()),
  assignablePermissions: z.array(z.string()),
});
export const adminAccessControlSchema = z.object({
  roles: z.array(adminRoleSchema),
  permissions: z.array(adminPermissionSchema),
  model: z.string(),
});
export type AdminAccessControl = z.infer<typeof adminAccessControlSchema>;

export const adminAuditLogSchema = z.object({
  id: z.string(),
  weddingId: z.string().nullable(),
  weddingTitle: z.string().nullable(),
  actorType: z.string(),
  actorUserId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  actorName: z.string().nullable(),
  actorGuestId: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export const adminAuditLogsSchema = pageSchema(adminAuditLogSchema);

export const planLimitsSchema = z.object({
  guestPlaces: z.number().nullable().optional(),
  mediaImages: z.number().nullable().optional(),
  emailInvites: z.number().nullable().optional(),
  smsInvites: z.number().nullable().optional(),
  reminderRounds: z.number().nullable().optional(),
  coHosts: z.number().nullable().optional(),
  seatingTables: z.number().nullable().optional(),
  checkin: z.boolean().optional(),
  giftQr: z.boolean().optional(),
  giftExport: z.boolean().optional(),
  aiThankYouRuns: z.number().nullable().optional(),
  premiumTemplates: z.boolean().optional(),
  brandingBadge: z.boolean().optional(),
  customSlug: z.boolean().optional(),
  publicLinkDaysAfterWedding: z.number().nullable().optional(),
  publicSeatLookup: z.boolean().optional(),
  retentionDaysAfterWedding: z.number().nullable().optional(),
});
export type PlanLimits = z.infer<typeof planLimitsSchema>;

export const adminPlanSchema = z.object({
  code: z.string(),
  name: z.string(),
  price: z.number(),
  currency: z.string(),
  status: z.string(),
  limits: planLimitsSchema,
  activeWeddings: z.number(),
});
export type AdminPlan = z.infer<typeof adminPlanSchema>;

export const adminPlanOrderSchema = z.object({
  id: z.string(),
  weddingId: z.string().nullable().optional(),
  weddingTitle: z.string().nullable().optional(),
  ownerEmail: z.string().nullable().optional(),
  planCode: z.string(),
  code: z.string(),
  amount: z.number(),
  paidAmount: z.number(),
  status: z.string(),
  note: z.string().nullable().optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
  paidAt: z.string().nullable().optional(),
  cancelledAt: z.string().nullable().optional(),
});
export type AdminPlanOrder = z.infer<typeof adminPlanOrderSchema>;
export const adminPlanOrdersPageSchema = pageSchema(adminPlanOrderSchema);

export const adminPlanPaymentSchema = z.object({
  id: z.string(),
  providerTransactionId: z.number(),
  orderId: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
  amount: z.number(),
  accountNumber: z.string(),
  content: z.string(),
  referenceCode: z.string().nullable().optional(),
  status: z.string(),
  reason: z.string().nullable().optional(),
  transactionAt: z.string(),
  receivedAt: z.string(),
});
export type AdminPlanPayment = z.infer<typeof adminPlanPaymentSchema>;
export const adminPlanPaymentsPageSchema = pageSchema(adminPlanPaymentSchema);

export const planRevenueRowSchema = z.object({
  key: z.string(),
  amount: z.number(),
  orders: z.number(),
});
export const planRevenueSchema = z.object({
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  total: z.number(),
  paidOrders: z.number(),
  byPlan: z.array(planRevenueRowSchema),
  byMonth: z.array(planRevenueRowSchema),
  paymentsToReview: z.number(),
});
export type PlanRevenue = z.infer<typeof planRevenueSchema>;

function queryString(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.toString();
}

export const adminApi = {
  dashboard: (api: ApiClient, signal?: AbortSignal) =>
    api.request("/admin/dashboard", { signal, schema: adminDashboardSchema }),
  users: (
    api: ApiClient,
    input: { page: number; pageSize?: number; search?: string; status?: string; role?: string },
    signal?: AbortSignal,
  ) => api.request(`/admin/users?${queryString(input)}`, { signal, schema: adminUsersSchema }),
  setUserStatus: (api: ApiClient, userId: string, status: "ACTIVE" | "SUSPENDED") =>
    api.request(`/admin/users/${encodeURIComponent(userId)}/status`, {
      method: "PUT",
      body: { status },
      schema: adminUserSchema,
    }),
  setUserRole: (api: ApiClient, userId: string, role: "ADMIN" | "USER") =>
    api.request(`/admin/users/${encodeURIComponent(userId)}/role`, {
      method: "PUT",
      body: { role },
      schema: adminUserSchema,
    }),
  weddings: (
    api: ApiClient,
    input: { page: number; pageSize?: number; search?: string; status?: string },
    signal?: AbortSignal,
  ) =>
    api.request(`/admin/weddings?${queryString(input)}`, { signal, schema: adminWeddingsSchema }),
  templates: (
    api: ApiClient,
    input: { page: number; pageSize?: number; search?: string; status?: string },
    signal?: AbortSignal,
  ) =>
    api.request(`/admin/templates?${queryString(input)}`, { signal, schema: adminTemplatesSchema }),
  createTemplate: (
    api: ApiClient,
    input: {
      name: string;
      slug: string;
      theme?: string | null;
      previewUrl?: string | null;
      configurationJson?: string | null;
      status: string;
    },
  ) =>
    api.request("/admin/templates", { method: "POST", body: input, schema: adminTemplateSchema }),
  updateTemplate: (
    api: ApiClient,
    id: string,
    input: {
      name: string;
      slug: string;
      theme?: string | null;
      previewUrl?: string | null;
      configurationJson?: string | null;
      status: string;
    },
  ) =>
    api.request(`/admin/templates/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: input,
      schema: adminTemplateSchema,
    }),
  setTemplateStatus: (api: ApiClient, id: string, status: string) =>
    api.request(`/admin/templates/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      body: { status },
      schema: adminTemplateSchema,
    }),
  accessControl: (api: ApiClient, signal?: AbortSignal) =>
    api.request("/admin/access-control", { signal, schema: adminAccessControlSchema }),
  updateRolePermissions: (api: ApiClient, role: string, permissions: string[]) =>
    api.request(`/admin/roles/${encodeURIComponent(role)}/permissions`, {
      method: "PUT",
      body: { permissions },
      schema: adminAccessControlSchema,
    }),
  auditLogs: (
    api: ApiClient,
    input: {
      page: number;
      pageSize?: number;
      action?: string;
      entityType?: string;
      from?: string;
      to?: string;
    },
    signal?: AbortSignal,
  ) =>
    api.request(`/admin/audit-logs?${queryString(input)}`, {
      signal,
      schema: adminAuditLogsSchema,
    }),
  plans: (api: ApiClient, signal?: AbortSignal) =>
    api.request("/admin/plans", { signal, schema: z.array(adminPlanSchema) }),
  updatePlan: (
    api: ApiClient,
    code: string,
    input: { name: string; price: number; status: string; limits: PlanLimits },
  ) =>
    api.request(`/admin/plans/${encodeURIComponent(code)}`, {
      method: "PUT",
      body: input,
      schema: adminPlanSchema,
    }),
  planOrders: (
    api: ApiClient,
    input: { page: number; pageSize?: number; status?: string; search?: string },
    signal?: AbortSignal,
  ) =>
    api.request(`/admin/plan-orders?${queryString(input)}`, {
      signal,
      schema: adminPlanOrdersPageSchema,
    }),
  approvePlanOrder: (api: ApiClient, orderId: string, note?: string) =>
    api.request(`/admin/plan-orders/${encodeURIComponent(orderId)}/approve`, {
      method: "POST",
      body: { note },
      schema: adminPlanOrderSchema,
    }),
  cancelPlanOrder: (api: ApiClient, orderId: string, note?: string) =>
    api.request(`/admin/plan-orders/${encodeURIComponent(orderId)}/cancel`, {
      method: "POST",
      body: { note },
      schema: adminPlanOrderSchema,
    }),
  planPayments: (
    api: ApiClient,
    input: { page: number; pageSize?: number; status?: string },
    signal?: AbortSignal,
  ) =>
    api.request(`/admin/plan-payments?${queryString(input)}`, {
      signal,
      schema: adminPlanPaymentsPageSchema,
    }),
  grantWeddingPlan: (
    api: ApiClient,
    weddingId: string,
    input: { planCode: string; note?: string },
  ) =>
    api.request(`/admin/weddings/${encodeURIComponent(weddingId)}/plan`, {
      method: "PUT",
      body: input,
      schema: z.object({
        weddingId: z.string(),
        planCode: z.string(),
        planName: z.string(),
        legacy: z.boolean(),
        limits: planLimitsSchema,
      }),
    }),
  planRevenue: (
    api: ApiClient,
    input?: { from?: string; to?: string },
    signal?: AbortSignal,
  ) =>
    api.request(`/admin/plan-revenue?${queryString(input ?? {})}`, {
      signal,
      schema: planRevenueSchema,
    }),
};
