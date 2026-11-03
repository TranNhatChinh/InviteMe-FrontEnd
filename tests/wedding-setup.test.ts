import assert from "node:assert/strict";
import test from "node:test";
import type { ApiClient } from "../src/core/api/api-client";
import {
  checkWeddingSlug,
  createWedding,
  deleteWeddingCover,
  getWeddings,
  updateWeddingSetup,
  uploadWeddingCover,
} from "../src/features/weddings/api/wedding.api";
import {
  isoToLocalDateTime,
  localDateTimeToIso,
  normalizeWeddingSlug,
  slugFromWeddingName,
  weddingCreateInputSchema,
  weddingListSchema,
} from "../src/features/weddings/schemas/wedding.schema";
import { validateWeddingCover } from "../src/features/weddings/components/wedding-cover-uploader";

test("normalizes a manually entered wedding slug and creates Vietnamese slugs", () => {
  assert.equal(normalizeWeddingSlug("  MINH-LAN-2026  "), "minh-lan-2026");
  assert.equal(slugFromWeddingName("Đám cưới Minh & Lan"), "dam-cuoi-minh-lan");
});

test("validates wedding slug format and RSVP deadline", () => {
  const base = {
    name: "Đám cưới Minh & Lan",
    slug: "minh-lan-2026",
    eventDateTime: "2026-12-20T11:00:00+07:00",
    venueName: "White Palace",
    venueAddress: "TP. Hồ Chí Minh",
    capacity: 200,
    rsvpDeadline: "2026-12-10T23:59:00+07:00",
    coverImageUrl: null,
  };
  assert.equal(weddingCreateInputSchema.safeParse(base).success, true);
  assert.equal(weddingCreateInputSchema.safeParse({ ...base, slug: "admin" }).success, false);
  assert.equal(weddingCreateInputSchema.safeParse({ ...base, slug: "Minh Lan" }).success, false);
  assert.equal(
    weddingCreateInputSchema.safeParse({ ...base, rsvpDeadline: "2026-12-21T00:00:00+07:00" })
      .success,
    false,
  );
});

test("converts form date-time in the wedding timezone without shifting the day", () => {
  const iso = localDateTimeToIso("2026-12-20T11:00", "Asia/Ho_Chi_Minh");
  assert.equal(iso, "2026-12-20T11:00:00+07:00");
  assert.equal(isoToLocalDateTime("2026-12-20T04:00:00Z", "Asia/Ho_Chi_Minh"), "2026-12-20T11:00");
  assert.throws(() => localDateTimeToIso("2026-02-30T11:00", "Asia/Ho_Chi_Minh"));
});

test("validates cover image type and 5 MB limit", () => {
  assert.equal(
    validateWeddingCover(new File(["image"], "cover.png", { type: "image/png" })),
    undefined,
  );
  assert.equal(
    validateWeddingCover(new File(["image"], "cover.webp", { type: "image/webp" })),
    undefined,
  );
  assert.match(
    validateWeddingCover(new File(["text"], "cover.gif", { type: "image/gif" })) ?? "",
    /JPEG, PNG hoặc WebP/,
  );
  assert.match(
    validateWeddingCover(
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.webp", { type: "image/webp" }),
    ) ?? "",
    /5 MB/,
  );
});

test("wedding list uses the authenticated BE contract, supported sorts and pagination metadata", async () => {
  const calls: { path: string; options: Record<string, unknown> }[] = [];
  const emptyResponse = {
    items: [],
    page: 2,
    pageSize: 10,
    totalCount: 11,
    totalPages: 2,
  };
  const api = {
    request: async (path: string, options: Record<string, unknown>) => {
      calls.push({ path, options });
      return weddingListSchema.parse(emptyResponse);
    },
  } as unknown as ApiClient;

  const page = await getWeddings(api, {
    page: 2,
    pageSize: 10,
    search: "Lan Nguyen",
    sort: "title",
  });

  assert.equal(calls[0]?.path, "/weddings?page=2&pageSize=10&search=Lan+Nguyen&sort=title");
  assert.equal(calls[0]?.options.auth, "required");
  assert.equal(page.totalPages, 2);
  assert.deepEqual(page.items, []);
});

test("wedding list preserves maxCapacity zero so the UI can render it as not configured", () => {
  const page = weddingListSchema.parse({
    items: [
      {
        id: "c21debf9-388b-4f6b-b9f2-57f405f12345",
        title: "Đám cưới Minh & Lan",
        slug: "dam-cuoi-minh-lan",
        weddingDate: "2027-04-12",
        participantCount: 0,
        maxCapacity: 0,
        version: 1,
      },
    ],
    page: 1,
    pageSize: 20,
    totalCount: 1,
    totalPages: 1,
  });

  assert.equal(page.items[0]?.maxCapacity, 0);
});

test("a list failure after create remains separate and does not repeat the create request", async () => {
  const methods: string[] = [];
  const created = {
    id: "c21debf9-388b-4f6b-b9f2-57f405f12345",
    name: "Đám cưới Minh & Lan",
    slug: "dam-cuoi-minh-lan",
    eventDateTime: "2027-04-12T10:00:00+07:00",
    venueName: "Nhà hàng",
    venueAddress: "TP. Hồ Chí Minh",
    capacity: 200,
    rsvpDeadline: "2027-04-01T10:00:00+07:00",
    coverImageUrl: null,
    timeZoneId: "Asia/Ho_Chi_Minh",
    status: "DRAFT",
    version: 1,
    createdAt: "2026-10-18T00:00:00Z",
    updatedAt: "2026-10-18T00:00:00Z",
  };
  const api = {
    request: async (_path: string, options: Record<string, unknown>) => {
      const method = String(options.method ?? "GET");
      methods.push(method);
      if (method === "POST") return created;
      throw new Error("Wedding list is temporarily unavailable.");
    },
  } as unknown as ApiClient;
  const input = {
    name: created.name,
    slug: created.slug,
    eventDateTime: created.eventDateTime,
    venueName: created.venueName,
    venueAddress: created.venueAddress,
    capacity: created.capacity,
    rsvpDeadline: created.rsvpDeadline,
    coverImageUrl: null,
  };

  const result = await createWedding(api, input);
  assert.equal(result.id, created.id);
  await assert.rejects(getWeddings(api, { page: 1, pageSize: 20 }), /temporarily unavailable/);
  assert.deepEqual(methods, ["POST", "GET"]);
});

test("wedding API sends typed create/update, slug and cover requests", async () => {
  const requests: { path: string; options: Record<string, unknown> }[] = [];
  const api = {
    request: async (path: string, options: Record<string, unknown>) => {
      requests.push({ path, options });
      return {};
    },
  } as unknown as ApiClient;
  const input = {
    name: "Đám cưới Minh & Lan",
    slug: "minh-lan-2026",
    eventDateTime: "2026-12-20T11:00:00+07:00",
    venueName: "White Palace",
    venueAddress: "TP. Hồ Chí Minh",
    capacity: 200,
    rsvpDeadline: "2026-12-10T23:59:00+07:00",
    coverImageUrl: null,
  };
  await createWedding(api, input);
  await updateWeddingSetup(api, "wedding/id", {
    ...input,
    coverImageUrl: null,
    expectedVersion: 12,
  });
  await checkWeddingSlug(api, "minh-lan-2026", "wedding-id");
  const image = new File(["jpeg"], "cover.jpg", { type: "image/jpeg" });
  await uploadWeddingCover(api, "wedding/id", image, 13);
  await deleteWeddingCover(api, "wedding/id", 14);

  const requestAt = (index: number) => {
    const request = requests[index];
    assert.ok(request);
    return request;
  };
  const createRequest = requestAt(0);
  const updateRequest = requestAt(1);
  const slugRequest = requestAt(2);
  const uploadRequest = requestAt(3);
  const deleteRequest = requestAt(4);
  assert.equal(createRequest.path, "/weddings");
  assert.equal(createRequest.options.method, "POST");
  assert.equal(JSON.stringify(createRequest.options.body).includes("owner"), false);
  assert.equal(updateRequest.path, "/weddings/wedding%2Fid");
  assert.equal((updateRequest.options.body as { expectedVersion: number }).expectedVersion, 12);
  assert.match(slugRequest.path, /check-slug\?slug=minh-lan-2026&weddingId=wedding-id/);
  const upload = uploadRequest.options.body as FormData;
  assert.equal(uploadRequest.options.method, "POST");
  assert.equal(upload.get("expectedVersion"), "13");
  assert.equal(upload.get("image"), image);
  assert.match(deleteRequest.path, /cover-image\?expectedVersion=14/);
  assert.equal(deleteRequest.options.method, "DELETE");
});
