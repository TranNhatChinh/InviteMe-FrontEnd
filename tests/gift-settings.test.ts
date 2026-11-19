import test from "node:test";
import assert from "node:assert/strict";
import {
  studioDocumentSchema,
  giftConfigurationError,
} from "../src/features/template-studio/schemas/document";
import { importedDocument } from "../src/features/template-studio/imported/document";
import { manualGiftQrUrl } from "../src/shared/api/invitation-gift-settings";
const doc = () => ({
  ...importedDocument([{ id: "p", imageUrl: "/media/p.png", width: 100, height: 200, order: 0 }]),
  widgets: [
    {
      id: "g",
      pageId: "p",
      type: "GIFT" as const,
      enabled: true,
      x: 0,
      y: 0,
      width: 0.5,
      height: 0.1,
      label: "Gift",
      backgroundColor: "#ffffff",
      textColor: "#000000",
    },
  ],
});
test("gift validation blocks missing configuration, permits disabling and complete uploads", () => {
  const d = doc();
  assert.ok(giftConfigurationError(d));
  d.widgets[0]!.enabled = false;
  assert.equal(giftConfigurationError(d), null);
  d.widgets[0]!.enabled = true;
  d.nodes.ROOT!.props.gift = { mode: "UPLOADED", recipients: [{ role: "BRIDE", enabled: true }] };
  assert.ok(giftConfigurationError(d));
  d.nodes.ROOT!.props.gift.recipients[0]!.imageUrl = "/media/qr.png";
  assert.equal(giftConfigurationError(studioDocumentSchema.parse(d)), null);
});
test("gift validation rejects incomplete linked accounts, duplicate roles and mixed modes", () => {
  const d = doc();
  d.nodes.ROOT!.props.gift = { mode: "LINKED", recipients: [{ role: "BRIDE", enabled: true }] };
  assert.ok(giftConfigurationError(d));
  assert.equal(
    studioDocumentSchema.safeParse({
      ...d,
      nodes: {
        ...d.nodes,
        ROOT: {
          ...d.nodes.ROOT,
          props: {
            gift: {
              mode: "UPLOADED",
              recipients: [
                {
                  role: "BRIDE",
                  enabled: true,
                  imageUrl: "/media/qr.png",
                  accountId: "4ffb79c4-0bc2-46b5-a798-b4eeb2a97977",
                },
              ],
            },
          },
        },
      },
    }).success,
    false,
  );
});
import { storedInvitationDocument } from "../src/features/template-studio/api/design.api";
test("gift QR media uses portable storage paths without changing external URLs", () => {
  const d = doc();
  d.nodes.ROOT!.props.gift = {
    mode: "UPLOADED",
    recipients: [
      { role: "BRIDE", enabled: true, imageUrl: "http://localhost:5043/media/wedding/qr.png" },
      { role: "GROOM", enabled: true, imageUrl: "https://other.example/qr.png" },
    ],
  };
  const saved = storedInvitationDocument(d);
  assert.equal(saved.nodes.ROOT?.props.gift?.recipients[0]?.imageUrl, "/media/wedding/qr.png");
  assert.equal(
    saved.nodes.ROOT?.props.gift?.recipients[1]?.imageUrl,
    "https://other.example/qr.png",
  );
});

test("manual QR requires bank and account number without a holder name or guest code", () => {
  const d = doc();
  d.nodes.ROOT!.props.gift = { mode: "MANUAL", recipients: [{ role: "BRIDE", enabled: true, bankBin: "970422", accountNumber: "000000001010" }] };
  assert.equal(giftConfigurationError(studioDocumentSchema.parse(d)), null);
  const url = new URL(manualGiftQrUrl("970422", "000000001010"));
  assert.equal(url.search, "");
  assert.ok(url.pathname.includes("000000001010"));
  d.nodes.ROOT!.props.gift.recipients[0]!.accountNumber = "123";
  assert.ok(giftConfigurationError(d));
});
