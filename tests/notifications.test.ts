import assert from "node:assert/strict";
import test from "node:test";
import {
  notificationHref,
  notificationText,
} from "../src/features/notifications/utils/notification-text";
import type { AppNotification } from "../src/features/notifications/api/notifications.api";
import { resources } from "../src/i18n/resources";

const item = (type: string, data: Record<string, unknown>): AppNotification => ({
  id: "n1",
  weddingId: "w1",
  weddingTitle: "Lễ cưới",
  type,
  data,
  createdAt: "2026-10-29T03:00:00Z",
  readAt: null,
});

// Minimal i18next-like translator over the real dictionaries, to check every kind has text in both languages.
const translator =
  (language: "vi" | "en") =>
  (key: string, values: Record<string, unknown> = {}) => {
    const raw = key
      .split(".")
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)?.[part],
        resources[language].notifications,
      );
    assert.equal(typeof raw, "string", `${language}: missing notifications.${key}`);
    return (raw as string).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      String(values[name] ?? ""),
    );
  };

const samples = [
  item("RSVP_SUBMITTED", { guestName: "Chú Ba", decision: "ATTENDING", people: 3, maxPeople: 4 }),
  item("RSVP_UPDATED", { guestName: "Chú Ba", decision: "DECLINED", people: 0, maxPeople: 4 }),
  item("RSVP_OVER_LIMIT", {
    guestName: "Anh Tuấn",
    decision: "ATTENDING",
    people: 5,
    maxPeople: 3,
  }),
  item("RSVP_CHANGE_REQUESTED", {
    guestName: "Chị Lan",
    decision: "MAYBE",
    people: 1,
    maxPeople: 2,
  }),
  item("GIFT_CLAIMED", { giverName: "Bạn Minh", method: "QR", amount: 500000 }),
  item("GIFT_DESK_PENDING", { giverName: "Cô Hoa", method: "CASH", amount: null }),
  item("SOMETHING_NEW", {}),
];

test("every notification kind renders in Vietnamese and English", () => {
  for (const language of ["vi", "en"] as const)
    for (const sample of samples) {
      const line = notificationText(sample, translator(language), language);
      assert.ok(line.length > 0 && !line.includes("{{"), `${language} ${sample.type}: ${line}`);
    }
});

test("RSVP text carries the guest and the number of people", () => {
  const line = notificationText(samples[0]!, translator("vi"), "vi");
  assert.match(line, /Chú Ba/);
  assert.match(line, /3/);
});

test("a click opens the RSVP list, the change requests or the gift book", () => {
  assert.equal(notificationHref(samples[0]!), "/weddings/w1/rsvp");
  assert.equal(notificationHref(samples[3]!), "/weddings/w1/waitlist");
  assert.equal(notificationHref(samples[4]!), "/weddings/w1/gifts");
});
