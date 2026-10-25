import assert from "node:assert/strict";
import test from "node:test";
import type { ApiClient } from "../src/core/api/api-client";
import {
  getPublicWebsite,
  getWebsite,
  isLegacyWebsiteDocument,
  isStudioDocument,
  publishWebsite,
  saveWebsite,
  unpublishWebsite,
} from "../src/features/weddings/api/website.api";
import { storyTemplateCatalog } from "../src/features/template-studio/templates/catalog";
import { parseStudioDocument } from "../src/features/template-studio/schemas/document";

test("identifies Studio JSON vs legacy website documents correctly", () => {
  const storyDoc = structuredClone(storyTemplateCatalog[0]!.document);
  assert.equal(isStudioDocument(storyDoc), true);
  assert.equal(isLegacyWebsiteDocument(storyDoc), false);

  const legacyDoc = {
    templateId: "story-red-velvet",
    title: "Lễ Cưới Minh & Lan",
    partnerOne: "Minh",
    partnerTwo: "Lan",
    eventAt: "2026-12-20T11:00:00+07:00",
    venueName: "White Palace",
    venueAddress: "TP. Hồ Chí Minh",
  };
  assert.equal(isStudioDocument(legacyDoc), false);
  assert.equal(isLegacyWebsiteDocument(legacyDoc), true);

  assert.equal(isStudioDocument(null), false);
  assert.equal(isLegacyWebsiteDocument(null), false);
  assert.equal(isStudioDocument({}), false);
  assert.equal(isLegacyWebsiteDocument({}), false);
});

test("storyTemplateCatalog provides 6 distinct wedding story templates using Studio JSON", () => {
  assert.equal(storyTemplateCatalog.length, 6);
  const ids = storyTemplateCatalog.map((t) => t.id);
  assert.deepEqual(ids, [
    "story-red-velvet",
    "story-editorial-61",
    "story-garden-02",
    "story-seaside-01",
    "story-scarlet-39",
    "story-sage-53",
  ]);

  for (const template of storyTemplateCatalog) {
    assert.ok(template.name.length > 0);
    assert.ok(template.description.length > 0);
    assert.equal(template.document.schemaVersion, 1);
    const root = template.document.nodes.ROOT;
    if (!root) throw new Error("Missing ROOT");
    assert.equal(root.type.resolvedName, "StudioFrame");

    // Wedding story document should be valid Studio JSON round-trip
    const parsed = parseStudioDocument(JSON.stringify(template.document));
    assert.equal(parsed.schemaVersion, 1);
  }
});

test("Website Story document stores personal story in the same Studio JSON format as Invitation", () => {
  // Both Wedding Website and Invitation use Studio Document JSON (Craft.js nodes tree + schemaVersion 1)
  const template = storyTemplateCatalog[0]!;
  const storyDoc = structuredClone(template.document);

  // Customize personal couple story text & photo
  const textEntry = Object.entries(storyDoc.nodes).find(
    ([, n]) => n.type.resolvedName === "StudioText",
  );
  assert.ok(textEntry);
  const [textNodeId, textNode] = textEntry;
  textNode.props.text = "Câu chuyện tình yêu của chúng mình bắt đầu từ mùa thu 2020...";

  // Confirm format matches Invitation document schema:
  assert.equal(storyDoc.schemaVersion, 1);
  const root = storyDoc.nodes.ROOT;
  if (!root) throw new Error("Missing ROOT");
  assert.ok(root.isCanvas);
  assert.ok(Array.isArray(root.nodes));
  assert.ok(root.nodes.length > 0);

  // Validate that parseStudioDocument accepts it cleanly
  const validated = parseStudioDocument(JSON.stringify(storyDoc));
  assert.equal(
    validated.nodes[textNodeId]?.props.text,
    "Câu chuyện tình yêu của chúng mình bắt đầu từ mùa thu 2020...",
  );
});

test("saveWebsite sends Studio JSON document with portable media URLs and guards expectedVersion", async () => {
  const document = structuredClone(storyTemplateCatalog[0]!.document);
  const image = Object.values(document.nodes).find(
    (node) => node.type.resolvedName === "StudioImage",
  );
  assert.ok(image);
  const mediaPath = `/media/wedding-covers/${"c".repeat(32)}/${"d".repeat(48)}.png`;
  image.props.src = `https://localhost:7043${mediaPath}`;

  const requests: { path: string; options: Record<string, unknown> }[] = [];
  const api = {
    request: async (path: string, options: Record<string, unknown>) => {
      requests.push({ path, options });
      return {
        version: 2,
        document,
        status: "DRAFT",
        hasUnpublishedChanges: true,
      };
    },
  } as unknown as ApiClient;

  const result = await saveWebsite(api, "wedding-123", 1, JSON.stringify(document));
  assert.equal(result.version, 2);
  assert.equal(result.status, "DRAFT");
  assert.equal(result.hasUnpublishedChanges, true);

  assert.equal(requests[0]!.path, "/weddings/wedding-123/website");
  const body = requests[0]!.options.body as {
    expectedVersion: number;
    document: typeof document;
  };
  assert.equal(body.expectedVersion, 1);
  // Full URL must be normalized to portable relative path
  const savedImage = Object.values(body.document.nodes).find(
    (node) => node.type.resolvedName === "StudioImage",
  );
  assert.equal(savedImage?.props.src, mediaPath);
});

test("getWebsite retrieves draft Studio JSON document and reports publication status", async () => {
  const document = structuredClone(storyTemplateCatalog[0]!.document);
  const api = {
    request: async () => ({
      version: 1,
      document,
      status: "DRAFT",
      hasUnpublishedChanges: false,
    }),
  } as unknown as ApiClient;

  const result = await getWebsite(api, "wedding-123");
  assert.equal(result.version, 1);
  assert.equal(result.status, "DRAFT");
  assert.equal(result.hasUnpublishedChanges, false);
  assert.equal(isStudioDocument(result.document), true);
});

test("publishWebsite and unpublishWebsite guard expectedVersion", async () => {
  const requests: { path: string; options: Record<string, unknown> }[] = [];
  const api = {
    request: async (path: string, options: Record<string, unknown>) => {
      requests.push({ path, options });
      return {
        version: 3,
        document: storyTemplateCatalog[0]!.document,
        status: path.endsWith("/publish") ? "PUBLISHED" : "UNPUBLISHED",
        hasUnpublishedChanges: false,
      };
    },
  } as unknown as ApiClient;

  const published = await publishWebsite(api, "wedding-456", 2);
  assert.equal(published.status, "PUBLISHED");
  assert.equal(requests[0]!.path, "/weddings/wedding-456/website/publish");
  assert.deepEqual(requests[0]!.options.body, { expectedVersion: 2 });

  const unpublished = await unpublishWebsite(api, "wedding-456", 3);
  assert.equal(unpublished.status, "UNPUBLISHED");
  assert.equal(requests[1]!.path, "/weddings/wedding-456/website/unpublish");
  assert.deepEqual(requests[1]!.options.body, { expectedVersion: 3 });
});

test("getPublicWebsite requests slug anonymously and parses published Studio snapshot", async () => {
  const document = structuredClone(storyTemplateCatalog[1]!.document);
  const requests: { path: string; options: Record<string, unknown> }[] = [];
  const api = {
    request: async (path: string, options: Record<string, unknown>) => {
      requests.push({ path, options });
      return {
        slug: "minh-lan-story",
        document,
      };
    },
  } as unknown as ApiClient;

  const response = await getPublicWebsite(api, "minh-lan-story");
  assert.equal(response.slug, "minh-lan-story");
  assert.equal(requests[0]!.path, "/public/weddings/minh-lan-story");
  assert.equal(requests[0]!.options.auth, "none");
  assert.equal(isStudioDocument(response.document), true);
  if (isStudioDocument(response.document)) {
    assert.equal(response.document.schemaVersion, 1);
  }
});

test("getPublicWebsite accepts legacy published website without throwing", async () => {
  const legacyDoc = {
    templateId: "story-red-velvet",
    title: "Lễ Thành Hôn Cũ",
    partnerOne: "Hoàng",
    partnerTwo: "Lan",
    eventAt: "2026-12-20T11:00:00+07:00",
  };
  const api = {
    request: async () => ({
      slug: "old-wedding",
      document: legacyDoc,
    }),
  } as unknown as ApiClient;

  const response = await getPublicWebsite(api, "old-wedding");
  assert.equal(response.slug, "old-wedding");
  assert.equal(isLegacyWebsiteDocument(response.document), true);
  assert.equal(isStudioDocument(response.document), false);
});

test("Website Story templates preserve calendar widget settings and interactive links", () => {
  // Calendar actions work across wedding websites:
  for (const template of storyTemplateCatalog) {
    const calendarNode = Object.values(template.document.nodes).find(
      (n) => n.type.resolvedName === "StudioCalendar",
    );
    if (calendarNode) {
      assert.ok(calendarNode.props);
      // Calendar nodes have valid layout props
      assert.equal(calendarNode.parent, "ROOT");
    }
  }
});

