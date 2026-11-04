import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultLanguage, getIntlLocale, isLanguage } from "../src/i18n/config";
import { formatDate, formatNumber } from "../src/i18n/format";
import { namespaces, resources } from "../src/i18n/resources";
import {
  formatGuestSide,
  formatRecipientLabel,
  seatingStrategyLabel,
} from "../src/features/guests/utils/seating-demo-i18n";

function leafPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

test("Vietnamese and English dictionaries have matching translation keys", () => {
  for (const namespace of namespaces) {
    const vietnamese = leafPaths(resources.vi[namespace]).sort();
    const english = leafPaths(resources.en[namespace]).sort();
    assert.deepEqual(english, vietnamese, `Translation keys differ in ${namespace}`);
  }
});

test("Vietnamese is the default and unsupported language values are rejected", () => {
  assert.equal(defaultLanguage, "vi");
  assert.equal(isLanguage("vi"), true);
  assert.equal(isLanguage("en"), true);
  assert.equal(isLanguage("fr"), false);
  assert.equal(getIntlLocale("vi"), "vi-VN");
  assert.equal(getIntlLocale("en"), "en-US");
});

test("date and number display follows the selected locale without changing values", () => {
  const date = new Date("2026-10-23T12:00:00.000Z");
  const vietnameseDate = formatDate(date, "vi", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
  const englishDate = formatDate(date, "en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  assert.equal(vietnameseDate, "23/10/2026");
  assert.equal(englishDate, "Oct 23, 2026");
  assert.equal(formatNumber(1234567, "en"), "1,234,567");
  assert.equal(Number(formatNumber(1234567, "vi").replaceAll(".", "")), 1234567);
});

test("seating preview translates interface labels while preserving guest-provided names", () => {
  const translate = (key: string) =>
    ({
      family: "Family",
      groupPrefix: "Group",
      "sideValues.BRIDE": "Bride's side",
      "affinity.label": "Keep familiar groups together",
    })[key] ?? key;

  assert.equal(
    formatRecipientLabel({ name: "Nguyễn Văn An", address: "Bác" }, "en"),
    "Bác Nguyễn Văn An",
  );
  assert.equal(formatRecipientLabel({ name: "Nhóm bạn K45", address: "" }, "en"), "Nhóm bạn K45");
  assert.equal(formatGuestSide("BRIDE", translate), "Bride's side");
  assert.equal(seatingStrategyLabel("affinity", translate), "Keep familiar groups together");
});
