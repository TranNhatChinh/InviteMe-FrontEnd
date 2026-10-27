import assert from "node:assert/strict";
import test from "node:test";
import { weddingAccessSchema } from "../src/core/auth/auth.types";
import { isWeddingWidePermission } from "../src/core/auth/wedding-access";
import { createApiClient } from "../src/core/api/api-client";
import { getWeddingAccess } from "../src/features/weddings/api/wedding.api";

test("workspace access accepts the current backend owner's gift recording permission", async (context) => {
  const permissions = [
    "WEDDING_VIEW",
    "WEDDING_EDIT",
    "GUEST_VIEW",
    "GUEST_EDIT",
    "INVITATION_SEND",
    "RSVP_VIEW",
    "SEATING_VIEW",
    "SEATING_EDIT",
    "CHECKIN_MANAGE",
    "GIFT_VIEW",
    "GIFT_EDIT",
    "ANALYTICS_VIEW",
    "GIFT_RECORD",
  ];
  const payload = {
    weddingId: "796d9e76-ca77-4742-9f60-ed5b6d166098",
    isOwner: true,
    permissions,
    scopes: permissions.map((permission) => ({ permission, weddingWide: true, groups: [] })),
  };
  context.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    assert.equal(String(url), `https://api.example.test/api/weddings/${payload.weddingId}/access`);
    return Response.json(payload);
  });
  const api = createApiClient("https://api.example.test/api", {
    getGeneration: () => 1,
    getToken: async () => "owner-test-token",
    recover: async () => null,
    clear: () => undefined,
  });
  assert.deepEqual(await getWeddingAccess(api, payload.weddingId), payload);
});

test("reception gift recording does not imply gift management or guest group access", () => {
  const access = weddingAccessSchema.parse({
    weddingId: "wedding-1",
    isOwner: false,
    permissions: ["WEDDING_VIEW", "GIFT_RECORD"],
    scopes: [
      { permission: "WEDDING_VIEW", weddingWide: true, groups: [] },
      { permission: "GIFT_RECORD", weddingWide: true, groups: [] },
    ],
  });
  assert.equal(isWeddingWidePermission(access, "GIFT_RECORD"), true);
  assert.equal(isWeddingWidePermission(access, "GIFT_VIEW"), false);
  assert.equal(isWeddingWidePermission(access, "GUEST_VIEW"), false);
  assert.equal(access.permissions.includes("GIFT_EDIT"), false);
  assert.equal(
    weddingAccessSchema.safeParse({ ...access, permissions: ["UNKNOWN_PERMISSION"] }).success,
    false,
  );
});

test("wedding access contract includes named permission scopes", () => {
  const access = weddingAccessSchema.parse({
    weddingId: "wedding-1",
    isOwner: false,
    permissions: ["WEDDING_VIEW", "SEATING_EDIT", "CHECKIN_MANAGE"],
    scopes: [
      { permission: "WEDDING_VIEW", weddingWide: true, groups: [] },
      {
        permission: "SEATING_EDIT",
        weddingWide: false,
        groups: [{ id: "group-1", name: "Bạn bè" }],
      },
      { permission: "CHECKIN_MANAGE", weddingWide: true, groups: [] },
    ],
  });

  assert.equal(isWeddingWidePermission(access, "WEDDING_VIEW"), true);
  assert.equal(isWeddingWidePermission(access, "SEATING_EDIT"), false);
  assert.equal(isWeddingWidePermission(access, "CHECKIN_MANAGE"), true);
  assert.equal(
    access.scopes?.find((scope) => scope.permission === "SEATING_EDIT")?.groups[0]?.name,
    "Bạn bè",
  );
});

test("missing scope data never upgrades a co-host grant to wedding-wide", () => {
  const access = weddingAccessSchema.parse({
    weddingId: "wedding-1",
    isOwner: false,
    permissions: ["SEATING_EDIT"],
  });

  assert.equal(isWeddingWidePermission(access, "SEATING_EDIT"), false);
});
