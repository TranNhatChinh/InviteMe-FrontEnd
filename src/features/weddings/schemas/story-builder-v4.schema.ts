import { z } from "zod";
import { env } from "@/core/config/env";

const sharedWeddingImages = new Set([
  "/images/template-studio/story-collection/photo-39.webp",
  "/images/template-studio/story-collection/photo-39-groom.webp",
  "/images/template-studio/story-collection/photo-39-bride.webp",
  "/images/template-studio/story-collection/photo-39-walk.webp",
]);
const isSafeHttps = (value: string) => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
};
const isWeddingMediaReference = (value: string) => {
  if (!value) return true;
  if (value.startsWith("/media/")) return !value.includes("..") && !/[?#]/.test(value);
  try {
    const url = new URL(value);
    const apiOrigin = env.apiUrl ? new URL(env.apiUrl).origin : null;
    return Boolean(
      apiOrigin &&
      url.origin === apiOrigin &&
      url.pathname.startsWith("/media/") &&
      !url.pathname.includes("..") &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password,
    );
  } catch {
    return false;
  }
};
const imageUrlSchema = z.string().max(2048).refine(value => sharedWeddingImages.has(value) || isWeddingMediaReference(value), "Ảnh phải thuộc thư viện cưới hoặc được tải lên đám cưới này.");
const httpsUrlSchema = z.string().max(2048).refine(isSafeHttps, "Liên kết phải dùng HTTPS.");
const socialUrlSchema = z.string().max(500).refine(isSafeHttps, "Liên kết mạng xã hội phải dùng HTTPS.");
const guestExperienceSettingsSchema = z.object({
  tools: z.array(z.enum(["rsvp", "calendar", "gift", "wishes", "share"]))
    .max(4).refine(items => new Set(items).size === items.length, "Không chọn tiện ích trùng nhau." ).optional(),
  decoration: z.enum(["none", "petals", "sparkles", "hearts", "fireflies"]).optional(),
  intensity: z.enum(["light", "medium", "vivid"]).optional(),
}).strict();
const guestExperienceDefaultsSchema = z.object({
  tools: z.array(z.enum(["rsvp", "calendar", "gift", "wishes", "share"]))
    .max(4).refine(items => new Set(items).size === items.length).nullish(),
  decoration: z.enum(["none", "petals", "sparkles", "hearts", "fireflies"]).nullish(),
  intensity: z.enum(["light", "medium", "vivid"]).nullish(),
}).strict();
const imageItemSchema = z.object({ id: z.string().min(1).max(100), imageUrl: imageUrlSchema, alt: z.string().max(200).optional() }).strict();
const personSchema = z.object({
  displayName: z.string().max(50).optional(), fullName: z.string().max(100).optional(),
  photoUrl: imageUrlSchema.optional(), bio: z.string().max(2000).optional(),
  fatherName: z.string().max(100).optional(), motherName: z.string().max(100).optional(),
  social: z.object({ facebook: socialUrlSchema.optional(), instagram: socialUrlSchema.optional() }).strict().optional(),
}).strict();
const eventSchema = z.object({
  id: z.string().min(1).max(100), title: z.string().min(1).max(150),
  // The public API serializes unset event fields as null. Normalize those values
  // so valid V4 documents do not fall through the legacy website schema.
  description: z.string().max(1000).nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  timeZoneId: z.string().max(100).optional(),
  venueName: z.string().max(150).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  mapUrl: httpsUrlSchema.nullable().optional(),
}).strict();
const storyItemSchema = z.object({
  id: z.string().min(1).max(100), title: z.string().min(1).max(150), date: z.string().max(50).optional(),
  body: z.string().max(3000).optional(), imageUrl: imageUrlSchema.optional(),
}).strict();
const weddingPartyMemberSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().min(1).max(100), role: z.string().max(100).optional(),
  bio: z.string().max(1000).optional(), photoUrl: imageUrlSchema.optional(),
}).strict();

const storyTemplateConfigSectionSchema = z.object({
  type: z.string(),
  variant: z.string(),
  style: z.object({
    background: z.enum(["default", "soft", "accent"]).optional(),
    spacing: z.enum(["compact", "normal", "spacious"]).optional(),
    animation: z.enum(["none", "fade", "rise", "stagger", "zoom"]).optional(),
  }).strict().nullable().optional(),
  defaultContent: z.object({
    title: z.string().max(150).optional(),
    intro: z.string().max(1000).optional(),
    eyebrow: z.string().max(120).optional(),
    subtitle: z.string().max(500).optional(),
    submitLabel: z.string().max(60).optional(),
  }).strict().nullable().optional(),
}).strict().superRefine((section, context) => {
  const defaults = section.defaultContent;
  if (!defaults) return;
  if (defaults.intro && defaults.intro.length > (section.type === "couple" ? 1000 : 500)) {
    context.addIssue({ code: "custom", path: ["defaultContent", "intro"], message: "Default introduction is too long for this section." });
  }
  const allowed = section.type === "hero"
    ? new Set(["title", "eyebrow", "subtitle"])
    : section.type === "rsvp"
      ? new Set(["title", "intro", "submitLabel"])
      : new Set(["title", "intro"]);
  for (const key of Object.keys(defaults)) {
    if (!allowed.has(key)) context.addIssue({ code: "custom", path: ["defaultContent", key], message: `Default content field ${key} is not supported for ${section.type}.` });
  }
});

export const storyTemplateConfigSchema = z.object({
  key: z.string().min(1), name: z.string().min(1),
  sections: z.array(storyTemplateConfigSectionSchema),
  theme: z.object({ colors: z.object({ primary: z.string(), background: z.string(), accent: z.string(), text: z.string() }).strict(), fontHeading: z.string(), fontBody: z.string() }).strict(),
  palettes: z.array(z.object({ id: z.string(), label: z.string(), colors: z.object({ primary: z.string(), background: z.string(), accent: z.string(), text: z.string() }).strict() }).strict()),
  allowedFonts: z.array(z.string()), assets: z.record(z.string(), z.string()).nullable().optional(),
  accessTier: z.enum(["UNCLASSIFIED", "FREE", "PREMIUM"]).default("UNCLASSIFIED"),
  guestExperienceDefaults: guestExperienceDefaultsSchema.nullish(),
  // Older published catalog rows may carry categories outside the current admin allowlist.
  // Keep gallery reads compatible; writes are still validated by the backend.
  category: z.string().max(80).nullable().optional(),
  previewImageUrl: z.string().max(2048).startsWith("/images/story-templates/").nullable().optional(),
}).strict();

export const storyTemplateSummarySchema = z.object({
  key: z.string(), version: z.number(), name: z.string(), config: storyTemplateConfigSchema,
}).strict();

const sectionCommon = {
  id: z.string().min(1).max(100), visible: z.boolean().optional(), title: z.string().max(150).optional(),
  intro: z.string().max(1000).optional(), navigationLabel: z.string().max(100).optional(),
  style: z.object({ background: z.enum(["default", "soft", "accent"]).optional(), spacing: z.enum(["compact", "normal", "spacious"]).optional(), animation: z.enum(["none", "fade", "rise", "stagger", "zoom"]).optional() }).strict().optional(),
  bindings: z.array(z.object({ target: z.string().min(1).max(100), source: z.string().min(1).max(100), mode: z.enum(["dynamic", "manual", "static"]).optional() }).strict()).max(4).optional(),
};
const heroContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional(), eyebrow: z.string().max(120).optional(), subtitle: z.string().max(500).optional(), ctaLabel: z.string().max(60).optional(), imageUrl: imageUrlSchema.optional(), slides: z.array(imageItemSchema).max(3).optional() }).strict();
const coupleContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(1000).optional(), groom: personSchema.optional(), bride: personSchema.optional() }).strict();
const countdownContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional(), targetDate: z.iso.datetime({ offset: true }).optional(), targetEventId: z.string().max(100).optional() }).strict();
const loveStoryContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional(), items: z.array(storyItemSchema).max(20).optional() }).strict();
const eventsContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional(), events: z.array(eventSchema).max(20).optional(), eventIds: z.array(z.string().min(1).max(100)).max(20).optional() }).strict();
const weddingPartyContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional(), groom: z.array(weddingPartyMemberSchema).max(12).optional(), bride: z.array(weddingPartyMemberSchema).max(12).optional() }).strict();
const galleryContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional(), images: z.array(imageItemSchema).max(30).optional() }).strict();
const rsvpContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional(), submitLabel: z.string().max(60).optional() }).strict();
const simpleContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional() }).strict();
const wishesContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional(), displayLimit: z.union([z.literal(0), z.literal(3), z.literal(6), z.literal(9), z.literal(12)]).optional(), allowLikes: z.boolean().optional(), allowComments: z.boolean().optional() }).strict();

const variants = {
  hero: ["floral", "dark", "split", "editorial", "ceremonial"],
  couple: ["alternating", "two-columns", "editorial"],
  countdown: ["classic", "banner", "inline"],
  loveStory: ["timeline", "editorial"],
  events: ["cards", "minimal"],
  weddingParty: ["classic", "editorial"],
  gallery: ["grid", "masonry"],
  rsvp: ["default"], wishes: ["default", "fountain"], gift: ["default", "minimal"],
} as const;
const makeSection = <T extends keyof typeof variants, S extends z.ZodTypeAny>(type: T, variant: readonly string[], content: S) =>
  z.object({ ...sectionCommon, type: z.literal(type), variant: z.enum(variant as [string, ...string[]]), content }).strict();

export const storyBuilderV4SectionSchema = z.discriminatedUnion("type", [
  makeSection("hero", variants.hero, heroContent), makeSection("couple", variants.couple, coupleContent),
  makeSection("countdown", variants.countdown, countdownContent), makeSection("loveStory", variants.loveStory, loveStoryContent),
  makeSection("events", variants.events, eventsContent), makeSection("gallery", variants.gallery, galleryContent),
  makeSection("weddingParty", variants.weddingParty, weddingPartyContent),
  makeSection("rsvp", variants.rsvp, rsvpContent), makeSection("wishes", variants.wishes, wishesContent),
  makeSection("gift", variants.gift, simpleContent),
]);

const pageSchema = z.object({
  id: z.string().min(1).max(100), slug: z.string().max(100), title: z.string().min(1).max(150),
  navigationLabel: z.string().max(100).optional(), visible: z.boolean().optional(), isHome: z.boolean(),
  sections: z.array(storyBuilderV4SectionSchema).max(24),
}).strict();
const reservedSlugs = new Set(["admin", "api", "assets", "_next"]);
const sharedContentSchema = z.object({
  groom: personSchema.optional(), bride: personSchema.optional(), events: z.array(eventSchema).max(20).optional(),
  mainEventId: z.string().optional(), gallery: z.array(imageItemSchema).max(30).optional(),
  loveStory: z.object({ enabled: z.boolean().optional(), intro: z.string().max(500).optional(), items: z.array(storyItemSchema).max(20).optional() }).strict().optional(),
  gift: z.object({ enabled: z.boolean(), groomBank: z.string().max(100).optional(), groomHolder: z.string().max(100).optional(), groomAccount: z.string().max(100).optional(), brideBank: z.string().max(100).optional(), brideHolder: z.string().max(100).optional(), brideAccount: z.string().max(100).optional() }).strict().optional(),
  heroImageUrl: imageUrlSchema.optional(), heroSlides: z.array(imageItemSchema).max(3).optional(), countdownTitle: z.string().max(150).optional(),
  eventsEnabled: z.boolean().optional(), galleryEnabled: z.boolean().optional(), wishesEnabled: z.boolean().optional(),
}).strict();

export const storyBuilderV4DocumentSchema = z.object({
  kind: z.literal("wedding-website"), schemaVersion: z.literal(4), builderVersion: z.literal(2),
  templateKey: z.string().min(1).max(80), templateVersion: z.number().int().positive().optional(),
  templateSnapshot: z.record(z.string(), z.unknown()).optional(),
  navigationMode: z.enum(["one-page", "multi-page", "hybrid"]), content: sharedContentSchema,
  seo: z.object({ title: z.string().max(70).optional(), description: z.string().max(200).optional(), imageUrl: imageUrlSchema.optional() }).strict().optional(),
  appearance: z.object({
    paletteId: z.string().optional(), fontHeading: z.string().optional(), fontBody: z.string().optional(), motion: z.enum(["template", "off"]).optional(),
    guestExperience: guestExperienceSettingsSchema.optional(),
  }).strict(),
  pages: z.array(pageSchema).min(1).max(8), publishedAt: z.string().optional(),
}).strict().superRefine((document, context) => {
  if (JSON.stringify(document).length > 200_000) context.addIssue({ code: "custom", message: "Website content exceeds 200 KB." });
  const homes = document.pages.filter(page => page.isHome);
  if (homes.length !== 1 || homes[0]?.slug !== "") context.addIssue({ code: "custom", message: "Exactly one home page must use an empty slug." });
  if (document.navigationMode === "one-page" && document.pages.length !== 1) context.addIssue({ code: "custom", message: "One-page websites must have exactly one page." });
  if (document.navigationMode === "multi-page" && document.pages.length < 2) context.addIssue({ code: "custom", message: "Multi-page websites need at least two pages." });
  const pageIds = new Set<string>(); const slugs = new Set<string>(); const sectionIds = new Set<string>(); let total = 0;
  for (const [pageIndex, page] of document.pages.entries()) {
    if (pageIds.has(page.id)) context.addIssue({ code: "custom", path: ["pages", pageIndex, "id"], message: "Page IDs must be unique." });
    if (slugs.has(page.slug.toLowerCase())) context.addIssue({ code: "custom", path: ["pages", pageIndex, "slug"], message: "Page paths must be unique." });
    pageIds.add(page.id); slugs.add(page.slug.toLowerCase());
    if (!page.isHome && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug) || reservedSlugs.has(page.slug))) context.addIssue({ code: "custom", path: ["pages", pageIndex, "slug"], message: "Page path must use a safe, unreserved slug." });
    if (page.isHome && page.visible === false) context.addIssue({ code: "custom", path: ["pages", pageIndex, "visible"], message: "The home page must be visible." });
    total += page.sections.length;
    if (page.visible !== false && !page.sections.some(section => section.visible !== false)) context.addIssue({ code: "custom", path: ["pages", pageIndex, "sections"], message: "Visible pages need a visible section." });
    const visibleHeroIndexes = page.sections.flatMap((section, index) => section.type === "hero" && section.visible !== false ? [index] : []);
    if (visibleHeroIndexes.length > 1) {
      for (const duplicateIndex of visibleHeroIndexes.slice(1)) context.addIssue({ code: "custom", path: ["pages", pageIndex, "sections", duplicateIndex], message: "A page may have only one visible hero section." });
    }
    for (const [sectionIndex, section] of page.sections.entries()) {
      if (sectionIds.has(section.id)) context.addIssue({ code: "custom", path: ["pages", pageIndex, "sections", sectionIndex, "id"], message: "Section IDs must be unique." });
      sectionIds.add(section.id);
    }
    for (const heroIndex of visibleHeroIndexes) {
      if (heroIndex > 0) context.addIssue({ code: "custom", path: ["pages", pageIndex, "sections", heroIndex], message: "The visible hero must be the first section." });
    }
  }
  if (!document.pages.some(page => page.visible !== false)) context.addIssue({ code: "custom", path: ["pages"], message: "At least one page must be visible." });
  if (total > 80) context.addIssue({ code: "custom", path: ["pages"], message: "A website may contain at most 80 sections." });
});

export type StoryBuilderV4Document = z.infer<typeof storyBuilderV4DocumentSchema>;
export type StoryBuilderV4Section = z.infer<typeof storyBuilderV4SectionSchema>;
export type StoryTemplateConfigV4 = z.infer<typeof storyTemplateConfigSchema>;
export type StoryTemplateSummaryV4 = z.infer<typeof storyTemplateSummarySchema>;
export type StorySectionType = StoryBuilderV4Section["type"];
