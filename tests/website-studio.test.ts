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
import { templateCatalog } from "../src/features/template-studio/templates/catalog";
import { parseStudioDocument } from "../src/features/template-studio/schemas/document";
import {
  storyTemplates,
  builtinStoryTemplateCatalog,
} from "../src/features/weddings/templates/story-templates";
import {
  starterWeddingStory,
  weddingStorySchema,
  isWeddingStoryDocument,
} from "../src/features/weddings/schemas/wedding-story.schema";
import {
  isStoryV3,
  toStoryDraftV3,
  fromStoryV3,
} from "../src/features/weddings/schemas/story-v3.schema";

test("identifies Studio JSON vs legacy website documents correctly", () => {
  const storyDoc = structuredClone(templateCatalog[0]!.document);
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

test("new storyTemplates provides romantic and royal template definitions", () => {
  const keys = Object.keys(storyTemplates);
  assert.deepEqual(keys, ["romantic", "royal"]);
  assert.equal(builtinStoryTemplateCatalog.length, 2);

  for (const template of builtinStoryTemplateCatalog) {
    assert.ok(template.name.length > 0);
    assert.ok(template.config.sections.length > 0);
    assert.ok(template.config.palettes.length > 0);
    assert.ok(template.config.allowedFonts.length > 0);
  }
});

test("new weddingStorySchema validates starter wedding story document", () => {
  const parsed = weddingStorySchema.parse(starterWeddingStory);
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.templateId, "romantic");
  assert.equal(isWeddingStoryDocument(parsed), true);
  assert.equal(isStudioDocument(parsed), false);

  const draftV3 = toStoryDraftV3(parsed);
  assert.equal(isStoryV3(draftV3), true);
  assert.equal(draftV3.schemaVersion, 3);
  assert.equal(draftV3.templateKey, "romantic");

  const restored = fromStoryV3(draftV3);
  assert.equal(restored.templateId, "romantic");
  assert.equal(restored.couple.groom.name, parsed.couple.groom.name);
  assert.equal(restored.couple.bride.name, parsed.couple.bride.name);
});

test("Website Studio document stores personal story in Studio JSON format", () => {
  const template = templateCatalog[0]!;
  const storyDoc = structuredClone(template.document);

  const textEntry = Object.entries(storyDoc.nodes).find(
    ([, n]) => n.type.resolvedName === "StudioText",
  );
  assert.ok(textEntry);
  const [textNodeId, textNode] = textEntry;
  textNode.props.text = "Câu chuyện tình yêu của chúng mình bắt đầu từ mùa thu 2020...";

  assert.equal(storyDoc.schemaVersion, 1);
  const root = storyDoc.nodes.ROOT;
  if (!root) throw new Error("Missing ROOT");
  assert.ok(root.isCanvas);
  assert.ok(Array.isArray(root.nodes));
  assert.ok(root.nodes.length > 0);

  const validated = parseStudioDocument(JSON.stringify(storyDoc));
  assert.equal(
    validated.nodes[textNodeId]?.props.text,
    "Câu chuyện tình yêu của chúng mình bắt đầu từ mùa thu 2020...",
  );
});

test("saveWebsite sends Studio JSON document with portable media URLs and guards expectedVersion", async () => {
  const document = structuredClone(templateCatalog[0]!.document);
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
  const savedImage = Object.values(body.document.nodes).find(
    (node) => node.type.resolvedName === "StudioImage",
  );
  assert.equal(savedImage?.props.src, mediaPath);
});

test("saveWebsite accepts storyDraftV3 documents", async () => {
  const draft = toStoryDraftV3(starterWeddingStory);
  const requests: { path: string; options: Record<string, unknown> }[] = [];
  const api = {
    request: async (path: string, options: Record<string, unknown>) => {
      requests.push({ path, options });
      return {
        version: 2,
        document: draft,
        status: "DRAFT",
        hasUnpublishedChanges: true,
      };
    },
  } as unknown as ApiClient;

  const result = await saveWebsite(api, "wedding-123", 1, draft);
  assert.equal(result.version, 2);
  assert.equal(requests[0]!.path, "/weddings/wedding-123/website");
  const body = requests[0]!.options.body as {
    expectedVersion: number;
    document: typeof draft;
  };
  assert.equal(body.expectedVersion, 1);
  assert.equal(body.document.schemaVersion, 3);
  assert.equal(body.document.templateKey, "romantic");
});

test("getWebsite retrieves draft Studio JSON document and reports publication status", async () => {
  const document = structuredClone(templateCatalog[0]!.document);
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
        document: templateCatalog[0]!.document,
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
  const document = structuredClone(templateCatalog[1]!.document);
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


