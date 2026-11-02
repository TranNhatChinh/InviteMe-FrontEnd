import type { ApiClient } from "@/core/api/api-client";
import { z } from "zod";
import {
  weddingCreateInputSchema,
  weddingSetupSchema,
  weddingSlugAvailabilitySchema,
  weddingCoverResultSchema,
  weddingUpdateInputSchema,
  weddingListSchema,
  type WeddingCreateInput,
  type WeddingSetup,
  type WeddingUpdateInput,
} from "../schemas/wedding.schema";
import { weddingAccessSchema } from "@/core/auth/auth.types";

export type WeddingListSort = "weddingDate" | "title" | "createdAt";
export type WeddingListRequest = {
  page: number;
  pageSize: number;
  search?: string;
  sort?: WeddingListSort;
};

export function getWeddingAccess(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(`/weddings/${encodeURIComponent(weddingId)}/access`, {
    signal,
    schema: weddingAccessSchema.refine((access) => access.weddingId === weddingId),
  });
}
export function getWeddings(api: ApiClient, params: WeddingListRequest, signal?: AbortSignal) {
  const search = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    search: params.search ?? "",
    sort: params.sort ?? "weddingDate",
  });
  return api.request(`/weddings?${search}`, {
    auth: "required",
    signal,
    schema: weddingListSchema,
  });
}

export function createWedding(api: ApiClient, input: WeddingCreateInput) {
  return api.request("/weddings", {
    method: "POST",
    body: weddingCreateInputSchema.parse(input),
    schema: weddingSetupSchema,
  });
}

export function getWeddingSetup(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(`/weddings/${encodeURIComponent(weddingId)}`, {
    signal,
    schema: weddingSetupSchema,
  });
}

export function updateWeddingSetup(api: ApiClient, weddingId: string, input: WeddingUpdateInput) {
  return api.request(`/weddings/${encodeURIComponent(weddingId)}`, {
    method: "PUT",
    body: weddingUpdateInputSchema.parse(input),
    schema: weddingSetupSchema,
  });
}

export function checkWeddingSlug(
  api: ApiClient,
  slug: string,
  weddingId?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ slug });
  if (weddingId) params.set("weddingId", weddingId);
  return api.request(`/weddings/check-slug?${params}`, {
    auth: "required",
    signal,
    schema: weddingSlugAvailabilitySchema,
  });
}

export function uploadWeddingCover(
  api: ApiClient,
  weddingId: string,
  image: File,
  expectedVersion: number,
) {
  const body = new FormData();
  body.set("image", image);
  body.set("expectedVersion", String(expectedVersion));
  return api.request(`/weddings/${encodeURIComponent(weddingId)}/cover-image`, {
    method: "POST",
    body,
    schema: weddingCoverResultSchema,
  });
}

export function deleteWeddingCover(api: ApiClient, weddingId: string, expectedVersion: number) {
  const params = new URLSearchParams({ expectedVersion: String(expectedVersion) });
  return api.request(`/weddings/${encodeURIComponent(weddingId)}/cover-image?${params}`, {
    method: "DELETE",
    schema: weddingCoverResultSchema,
  });
}

export function deleteWedding(
  api: ApiClient,
  weddingId: string,
  input: { confirmationSlug: string; expectedVersion: number; acknowledgePackageLoss: true },
) {
  return api.request(`/weddings/${encodeURIComponent(weddingId)}`, {
    method: "DELETE",
    body: input,
    schema: z.object({
      weddingId: z.string().uuid(),
      status: z.literal("DELETION_PENDING"),
      requestedAt: z.iso.datetime({ offset: true }),
    }),
  });
}

export type { WeddingSetup };
