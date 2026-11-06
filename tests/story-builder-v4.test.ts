import assert from "node:assert/strict";
import test from "node:test";
import { applyStoryBuilderV4Template, createStoryBuilderV4Document, createV4Section, summarizeStoryBuilderV4TemplateChange } from "../src/features/weddings/schemas/story-builder-v4.document";
import { describeV4ValidationIssues, moveV4Page } from "../src/features/weddings/schemas/story-builder-v4.helpers";
import { storyBuilderV4DocumentSchema, storyTemplateSummarySchema, type StoryTemplateSummaryV4 } from "../src/features/weddings/schemas/story-builder-v4.schema";
import type { WeddingSetup } from "../src/features/weddings/schemas/wedding.schema";

const setup: WeddingSetup = {
  id: "273705fc-e5a4-405c-963c-59a2bc82b432", name: "Minh & Lan", slug: "minh-lan",
  eventDateTime: "2026-11-28T10:30:00+07:00", venueName: "Nhà hàng Hoa", venueAddress: "TP. Hồ Chí Minh",
  capacity: null, rsvpDeadline: null, coverImageUrl: "/media/covers/wedding.jpg", timeZoneId: "Asia/Ho_Chi_Minh",
  status: "DRAFT", version: 1, createdAt: "2026-01-01T00:00:00+07:00", updatedAt: "2026-01-01T00:00:00+07:00",
};

const template: StoryTemplateSummaryV4 = {
  key: "garden", name: "Garden", version: 2,
  config: {
    key: "garden", name: "Garden",
    sections: [{ type: "hero", variant: "floral" }, { type: "couple", variant: "alternating" }, { type: "rsvp", variant: "default" }],
    theme: { colors: { primary: "#F4DADC", background: "#FFFAF5", accent: "#805459", text: "#3A2A2C" }, fontHeading: "Georgia", fontBody: "Georgia" },
    palettes: [{ id: "blush", label: "Blush", colors: { primary: "#F4DADC", background: "#FFFAF5", accent: "#805459", text: "#3A2A2C" } }],
    allowedFonts: ["Georgia"], accessTier: "FREE", category: "romantic", previewImageUrl: "/images/story-templates/garden.jpg",
  },
};

test("V4 template initialization uses Wedding Setup and migrates only available legacy fields", () => {
  const document = createStoryBuilderV4Document(template, setup, {
    title: "Ngày vui của Minh & Lan",
    couple: { groom: { name: "Minh" }, bride: { name: "Lan" } },
    content: { loveStory: { enabled: true, items: [{ title: "Lần đầu gặp", body: "Một buổi chiều" }] } },
  });
  assert.equal(document.pages[0]?.sections[0]?.type, "hero");
  assert.equal(document.pages[0]?.sections[0]?.content.title, "Ngày vui của Minh & Lan");
  assert.equal(document.content.groom?.displayName, "Minh");
  assert.equal(document.content.bride?.displayName, "Lan");
  assert.equal(document.content.events?.[0]?.venueName, "Nhà hàng Hoa");
});

test("changing a V4 template preserves pages and compatible content while retaining unmatched sections hidden", () => {
  const current = createStoryBuilderV4Document(template, setup, { content: { groom: { displayName: "Minh" } } });
  const home = current.pages[0]!;
  const oldCouple = home.sections.find(section => section.type === "couple")!;
  oldCouple.content = { ...oldCouple.content, intro: "Câu chuyện của chúng mình" };
  current.pages.push({
    id: "our-story", slug: "chuyen-tinh", title: "Chuyện tình", navigationLabel: "Chuyện tình", isHome: false, visible: true,
    sections: [createV4Section("hero", current.content, setup), createV4Section("loveStory", current.content, setup)],
  });
  current.navigationMode = "multi-page";

  const alternate: StoryTemplateSummaryV4 = {
    ...template,
    key: "editorial",
    name: "Editorial",
    version: 3,
    config: { ...template.config, key: "editorial", name: "Editorial", sections: [{ type: "hero", variant: "editorial" }, { type: "countdown", variant: "banner" }] },
  };
  const changed = applyStoryBuilderV4Template(alternate, current, setup);

  assert.equal(changed.templateKey, "editorial");
  assert.equal(changed.pages[0]?.id, home.id);
  assert.equal(changed.pages[1]?.slug, "chuyen-tinh");
  assert.equal(changed.navigationMode, "multi-page");
  assert.equal(changed.content.groom?.displayName, "Minh");
  assert.equal(changed.pages[0]?.sections[0]?.variant, "editorial");
  assert.equal(changed.pages[0]?.sections.find(section => section.type === "couple")?.visible, false);
  assert.equal((changed.pages[0]?.sections.find(section => section.type === "couple")?.content as { intro?: string }).intro, "Câu chuyện của chúng mình");
  assert.equal(current.templateKey, "garden");
  assert.equal(oldCouple.visible, true);
  const impact = summarizeStoryBuilderV4TemplateChange(current, changed);
  assert.equal(impact.pagesPreserved, 2);
  assert.equal(impact.sectionsPreserved, 5);
  assert.equal(impact.hiddenSections.length, 3);
  assert.equal(impact.addedSections.length, 2);
  assert.equal(impact.changedVariants, 2);
  assert.equal(impact.themeChanged, true);
});

test("duplicated section content is independent from the original section and shared content", () => {
  const document = createStoryBuilderV4Document(template, setup, { content: { groom: { displayName: "Minh" } } });
  const original = document.pages[0]!.sections.find(section => section.type === "couple")!;
  const duplicate = createV4Section("couple", document.content, setup);
  const duplicateContent = duplicate.content as { groom?: { displayName?: string } };
  duplicateContent.groom!.displayName = "Tên riêng của phần mới";
  assert.equal((original.content as { groom?: { displayName?: string } }).groom?.displayName, "Minh");
  assert.equal(document.content.groom?.displayName, "Minh");
});

test("V4 document rejects an unsafe map link and reserved multi-page route", () => {
  const document = createStoryBuilderV4Document(template, setup);
  const page = document.pages[0]!;
  page.sections.push({ id: "events", type: "events", variant: "cards", visible: true, content: { events: [{ id: "event", title: "Lễ cưới", mapUrl: "javascript:alert(1)" }] } });
  assert.equal(storyBuilderV4DocumentSchema.safeParse(document).success, false);

  const multiPage = createStoryBuilderV4Document(template, setup);
  multiPage.navigationMode = "multi-page";
  multiPage.pages.push({ id: "admin", slug: "admin", title: "Trang mới", navigationLabel: "Trang mới", isHome: false, visible: true, sections: [] });
  assert.equal(storyBuilderV4DocumentSchema.safeParse(multiPage).success, false);
});

test("V4 document rejects external image URLs that the backend cannot publish", () => {
  const document = createStoryBuilderV4Document(template, setup);
  const hero = document.pages[0]!.sections.find(section => section.type === "hero");
  assert.ok(hero);
  hero.content = { ...hero.content, imageUrl: "https://example.com/wedding.jpg" };
  assert.equal(storyBuilderV4DocumentSchema.safeParse(document).success, false);
});

test("page reordering keeps the home page first and moves other pages by one position", () => {
  const document = createStoryBuilderV4Document(template, setup);
  const page = (id: string, slug: string) => ({
    id, slug, title: slug, navigationLabel: slug, isHome: false, visible: true,
    sections: [createV4Section("hero", document.content, setup)],
  });
  const pages = [document.pages[0]!, page("page-story", "chuyen-tinh"), page("page-event", "su-kien")];

  const reordered = moveV4Page(pages, 2, -1);
  assert.deepEqual(reordered.map(item => item.id), [document.pages[0]!.id, "page-event", "page-story"]);
  assert.equal(moveV4Page(reordered, 1, -1), reordered);
  assert.deepEqual(pages.map(item => item.id), [document.pages[0]!.id, "page-story", "page-event"]);
});

test("validation feedback identifies the page, section and field in Vietnamese", () => {
  const document = createStoryBuilderV4Document(template, setup);
  const message = describeV4ValidationIssues([{
    path: ["pages", 0, "sections", 0, "content", "imageUrl"],
    message: "Ảnh phải thuộc thư viện cưới hoặc được tải lên đám cưới này.",
  }], document);

  assert.match(message, /Trang “Minh & Lan”/);
  assert.match(message, /Ảnh bìa/);
  assert.match(message, /ảnh/);
});

test("template catalog accepts existing backend category labels", () => {
  for (const category of ["outdoor", "editorial", "autumn", "royal", "traditional"]) {
    const result = storyTemplateSummarySchema.parse({ ...template, config: { ...template.config, category } });
    assert.equal(result.config.category, category);
  }
});
