import assert from "node:assert/strict";
import test from "node:test";
import type { ApiClient } from "@/core/api/api-client";
import {
  getInvitationDraft,
  invitationDraftSchema,
  queueInvitationBatch,
} from "@/features/invitations/api/invitation-messaging.api";

test("email redesign draft response is readable without the retired tone field", () => {
  const draft = invitationDraftSchema.parse({
    weddingId: "wedding-1",
    subject: "Lời mời ngày vui",
    content: "Chúng mình rất mong được đón bạn đến chung vui.",
    version: 1,
    usedFallback: false,
    smsContent: "Chúng mình mong được đón bạn.",
    smsUsedFallback: false,
  });
  assert.equal(draft.tone, undefined);
  assert.equal(draft.smsContent, "Chúng mình mong được đón bạn.");
});

test("invitation draft reads the API-owned draft or null", async () => {
  let capturedPath = "";
  const api = {
    request: async (path: string) => {
      capturedPath = path;
      return null;
    },
  } as unknown as ApiClient;

  const draft = await getInvitationDraft(api, "wedding / id");
  assert.equal(draft, null);
  assert.equal(capturedPath, "/weddings/wedding%20%2F%20id/invitation-messages/draft");
});

test("batch send carries the exact idempotency key and selected audience", async () => {
  let captured: { path: string; options: Record<string, unknown> } | undefined;
  const api = {
    request: async (path: string, options: Record<string, unknown>) => {
      captured = { path, options };
      return {
        id: "batch-1",
        status: "PENDING",
        totalCount: 1,
        sentCount: 0,
        failedCount: 0,
        pendingCount: 1,
        createdAt: "2026-10-19T00:00:00Z",
        jobs: [],
      };
    },
  } as unknown as ApiClient;
  const body = { guestIds: ["guest-1"], channels: ["EMAIL"] as ("EMAIL" | "SMS")[] };

  const batch = await queueInvitationBatch(api, "wedding-1", body, "key-123");
  assert.equal(batch.id, "batch-1");
  assert.equal(captured?.path, "/weddings/wedding-1/invitation-messages/send");
  assert.deepEqual(captured?.options.headers, { "Idempotency-Key": "key-123" });
  assert.deepEqual(captured?.options.body, body);
});
