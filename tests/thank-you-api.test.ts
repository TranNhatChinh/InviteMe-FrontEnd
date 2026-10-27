import assert from "node:assert/strict";
import test from "node:test";
import type { ApiClient } from "@/core/api/api-client";
import {
  generateThankYouTemplateOptions,
  listAllThankYouGuests,
  queueThankYouTemplateMessages,
} from "@/features/ai-thank-you/api/thank-you.api";

test("thank-you AI generates exactly one shared option without a tone selector", async () => {
  let request: Record<string, unknown> = {};
  const api = {
    request: async (_path: string, options: Record<string, unknown>) => {
      request = options;
      return [];
    },
  } as unknown as ApiClient;
  const guestIds = Array.from({ length: 201 }, (_, index) => `guest-${index}`);
  await generateThankYouTemplateOptions(api, "wedding-1", { guestIds, includeGiftAmount: false });
  assert.deepEqual(request.body, { guestIds, includeGiftAmount: false, variantCount: 1 });
  assert.equal(Object.hasOwn(request.body as object, "tone"), false);
});

test("thank-you all-recipient list loads beyond the first page", async () => {
  const api = {
    request: async (path: string) => {
      const page = Number(new URL(path, "https://api.test").searchParams.get("page"));
      return {
        items: Array.from({ length: page === 3 ? 5 : 100 }, (_, index) => ({
          id: `guest-${(page - 1) * 100 + index}`,
        })),
        page,
        pageSize: 100,
        totalItems: 205,
      };
    },
  } as unknown as ApiClient;
  assert.equal((await listAllThankYouGuests(api, "wedding-1")).length, 205);
});

test("one thank-you send applies the same approved template to the entire explicit audience", async () => {
  let request: Record<string, unknown> = {};
  const api = {
    request: async (_path: string, options: Record<string, unknown>) => {
      request = options;
      return { id: "batch-1", replayed: false };
    },
  } as unknown as ApiClient;
  const guests = Array.from({ length: 201 }, (_, index) => `guest-${index}`);
  await queueThankYouTemplateMessages(
    api,
    "wedding-1",
    "one-approved-template",
    guests,
    ["EMAIL"],
    "stable-key",
  );
  assert.deepEqual(request.body, {
    templateId: "one-approved-template",
    guestIds: guests,
    channels: ["EMAIL"],
  });
  assert.deepEqual(request.headers, { "Idempotency-Key": "stable-key" });
});
