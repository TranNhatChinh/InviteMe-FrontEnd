import assert from "node:assert/strict";
import test from "node:test";
import {
  loadAllMessageRecipients,
  MAX_MESSAGE_RECIPIENTS,
  missingRecipientContacts,
  toggleRecipientPage,
} from "@/shared/lib/message-recipients";

test("select all includes every page and more than 180 guests", async () => {
  const guests = Array.from({ length: 241 }, (_, index) => ({ id: `guest-${index}` }));
  const requested: number[] = [];
  const all = await loadAllMessageRecipients(async (page) => {
    requested.push(page);
    return {
      items: guests.slice((page - 1) * 100, page * 100),
      page,
      pageSize: 100,
      totalItems: guests.length,
    };
  });
  assert.deepEqual(requested.sort(), [1, 2, 3]);
  assert.deepEqual(
    all.map((guest) => guest.id),
    guests.map((guest) => guest.id),
  );
  const withoutOnePage = toggleRecipientPage(
    all.map((guest) => guest.id),
    guests.slice(100, 120).map((guest) => guest.id),
    false,
  );
  assert.equal(withoutOnePage.length, 221);
  assert.equal(
    new Set(
      toggleRecipientPage(
        withoutOnePage,
        guests.slice(100, 120).map((guest) => guest.id),
        true,
      ),
    ).size,
    241,
  );
});

test("all-recipient loading fails rather than returning a partial or duplicate selection", async () => {
  await assert.rejects(
    loadAllMessageRecipients(async (page) => ({
      items: [{ id: "same-id" }],
      page,
      pageSize: 1,
      totalItems: 2,
    })),
    /RECIPIENT_LIST_CHANGED/,
  );
  await assert.rejects(
    loadAllMessageRecipients(async (page) => ({
      items: [{ id: String(page) }],
      page,
      pageSize: 1,
      totalItems: page === 1 ? 2 : 1,
    })),
    /RECIPIENT_LIST_CHANGED/,
  );
  await assert.rejects(
    loadAllMessageRecipients(async (page) => {
      if (page === 2) throw new Error("network error");
      return { items: [{ id: "first" }], page, pageSize: 1, totalItems: 2 };
    }),
    /network error/,
  );
});

test("large lists are bounded and empty lists remain empty", async () => {
  await assert.rejects(
    loadAllMessageRecipients(async () => ({
      items: [],
      page: 1,
      pageSize: 100,
      totalItems: MAX_MESSAGE_RECIPIENTS + 1,
    })),
    /RECIPIENT_LIMIT_EXCEEDED/,
  );
  assert.deepEqual(
    await loadAllMessageRecipients(async () => ({
      items: [],
      page: 1,
      pageSize: 100,
      totalItems: 0,
    })),
    [],
  );
});

test("contact checks cover all selected pages and block stale or missing guests", () => {
  const guests = [
    { id: "email", recipientName: "An", email: "an@example.test", phone: null },
    { id: "phone", recipientName: "Bình", email: " ", phone: "0900123456" },
  ];
  assert.deepEqual(missingRecipientContacts(guests, ["email", "phone", "stale"], ["EMAIL"]), [
    "phone",
    "stale",
  ]);
  assert.deepEqual(missingRecipientContacts(guests, ["email", "phone"], ["SMS"]), ["email"]);
  assert.deepEqual(missingRecipientContacts(guests, ["email", "phone"], ["EMAIL", "SMS"]), [
    "email",
    "phone",
  ]);
});
