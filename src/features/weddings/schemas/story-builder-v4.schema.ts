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
const imageItemSchema = z.object({ id: z.string().min(1).max(100), imageUrl: imageUrlSchema, alt: z.string().max(200).optional() }).strict();
const personSchema = z.object({
  displayName: z.string().max(50).optional(), fullName: z.string().max(100).optional(),
  photoUrl: imageUrlSchema.optional(), bio: z.string().max(2000).optional(),
  fatherName: z.string().max(100).optional(), motherName: z.string().max(100).optional(),
  social: z.object({ facebook: socialUrlSchema.optional(), instagram: socialUrlSchema.optional() }).strict().optional(),
}).strict();
const eventSchema = z.object({
  id: z.string().min(1).max(100), title: z.string().min(1).max(150), startsAt: z.iso.datetime({ offset: true }).optional(),
  timeZoneId: z.string().max(100).optional(), venueName: z.string().max(150).optional(),
  address: z.string().max(300).optional(), mapUrl: httpsUrlSchema.optional(),
}).strict();
const storyItemSchema = z.object({
  id: z.string().min(1).max(100), title: z.string().min(1).max(150), date: z.string().max(50).optional(),
  body: z.string().max(3000).optional(), imageUrl: imageUrlSchema.optional(),
}).strict();

export const storyTemplateConfigSchema = z.object({
  key: z.string().min(1), name: z.string().min(1),
  sections: z.array(z.object({ type: z.string(), variant: z.string() }).strict()),
  theme: z.object({ colors: z.object({ primary: z.string(), background: z.string(), accent: z.string(), text: z.string() }).strict(), fontHeading: z.string(), fontBody: z.string() }).strict(),
  palettes: z.array(z.object({ id: z.string(), label: z.string(), colors: z.object({ primary: z.string(), background: z.string(), accent: z.string(), text: z.string() }).strict() }).strict()),
  allowedFonts: z.array(z.string()), assets: z.record(z.string(), z.string()).nullable().optional(),
  accessTier: z.enum(["UNCLASSIFIED", "FREE", "PREMIUM"]).default("UNCLASSIFIED"),
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
  style: z.object({ background: z.enum(["default", "soft", "accent"]).optional(), spacing: z.enum(["compact", "normal", "spacious"]).optional(), animation: z.enum(["none", "fade"]).optional() }).strict().optional(),
  bindings: z.array(z.object({ target: z.string().min(1).max(100), source: z.string().min(1).max(100), mode: z.enum(["dynamic", "manual", "static"]).optional() }).strict()).max(4).optional(),
};
const heroContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional(), eyebrow: z.string().max(120).optional(), subtitle: z.string().max(500).optional(), imageUrl: imageUrlSchema.optional(), slides: z.array(imageItemSchema).max(3).optional() }).strict();
const coupleContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(1000).optional(), groom: personSchema.optional(), bride: personSchema.optional() }).strict();
const countdownContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional(), targetDate: z.iso.datetime({ offset: true }).optional(), targetEventId: z.string().max(100).optional() }).strict();
const loveStoryContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional(), items: z.array(storyItemSchema).max(20).optional() }).strict();
const eventsContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional(), events: z.array(eventSchema).max(20).optional() }).strict();
const galleryContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional(), images: z.array(imageItemSchema).max(30).optional() }).strict();
const rsvpContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional(), submitLabel: z.string().max(60).optional() }).strict();
const simpleContent = z.object({ title: z.string().max(150).optional(), intro: z.string().max(500).optional() }).strict();

const variants = {
  hero: ["floral", "dark", "split", "editorial", "ceremonial"],
  couple: ["alternating", "two-columns", "editorial"],
  countdown: ["classic", "banner", "inline"],
  loveStory: ["timeline", "editorial"],
  events: ["cards", "minimal"],
  gallery: ["grid", "masonry"],
  rsvp: ["default"], wishes: ["default"], gift: ["default", "minimal"],
} as const;
const makeSection = <T extends keyof typeof variants, S extends z.ZodTypeAny>(type: T, variant: readonly string[], content: S) =>
  z.object({ ...sectionCommon, type: z.literal(type), variant: z.enum(variant as [string, ...string[]]), content }).strict();

export const storyBuilderV4SectionSchema = z.discriminatedUnion("type", [
  makeSection("hero", variants.hero, heroContent), makeSection("couple", variants.couple, coupleContent),
  makeSection("countdown", variants.countdown, countdownContent), makeSection("loveStory", variants.loveStory, loveStoryContent),
  makeSection("events", variants.events, eventsContent), makeSection("gallery", variants.gallery, galleryContent),
  makeSection("rsvp", variants.rsvp, rsvpContent), makeSection("wishes", variants.wishes, simpleContent),
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
  appearance: z.object({ paletteId: z.string().optional(), fontHeading: z.string().optional(), fontBody: z.string().optional(), motion: z.enum(["template", "off"]).optional() }).strict(),
  pages: z.array(pageSchema).min(1).max(8), publishedAt: z.string().optional(),
}).strict().superRefine((document, context) => {
  if (JSON.stringify(document).length > 200_000) context.addIssue({ code: "custom", message: "Website content exceeds 200 KB." });
  const homes = document.pages.filter(page => page.isHome);
  if (homes.length !== 1 || homes[0]?.slug !== "") context.addIssue({ code: "custom", message: "Exactly one home page must use an empty slug." });
  if (document.navigationMode === "one-page" && document.pages.length !== 1) context.addIssue({ code: "custom", message: "One-page websites must have exactly one page." });
  if (document.navigationMode === "multi-page" && document.pages.length < 2) context.addIssue({ code: "custom", message: "Multi-page websites need at least two pages." });
  const pageIds = new Set<string>(); const slugs = new Set<string>(); const sectionIds = new Set<string>(); let total = 0;
  for (const page of document.pages) {
    if (pageIds.has(page.id)) context.addIssue({ code: "custom", message: "Page IDs must be unique." });
    if (slugs.has(page.slug.toLowerCase())) context.addIssue({ code: "custom", message: "Page paths must be unique." });
    pageIds.add(page.id); slugs.add(page.slug.toLowerCase());
    if (!page.isHome && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug) || reservedSlugs.has(page.slug))) context.addIssue({ code: "custom", message: "Page path must use a safe, unreserved slug." });
    total += page.sections.length;
    const heroIndex = page.sections.findIndex(section => section.type === "hero" && section.visible !== false);
    if (heroIndex > 0) context.addIssue({ code: "custom", message: "The visible hero must be the first section." });
    if (page.visible !== false && !page.sections.some(section => section.visible !== false)) context.addIssue({ code: "custom", message: "Visible pages need a visible section." });
    for (const section of page.sections) {
      if (sectionIds.has(section.id)) context.addIssue({ code: "custom", message: "Section IDs must be unique." });
      sectionIds.add(section.id);
    }
  }
  if (total > 80) context.addIssue({ code: "custom", message: "A website may contain at most 80 sections." });
});

export type StoryBuilderV4Document = z.infer<typeof storyBuilderV4DocumentSchema>;
export type StoryBuilderV4Section = z.infer<typeof storyBuilderV4SectionSchema>;
export type StoryTemplateConfigV4 = z.infer<typeof storyTemplateConfigSchema>;
export type StoryTemplateSummaryV4 = z.infer<typeof storyTemplateSummarySchema>;
export type StorySectionType = StoryBuilderV4Section["type"];
