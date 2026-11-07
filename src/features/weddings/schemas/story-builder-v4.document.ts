import { storyBuilderV4DocumentSchema, type StoryBuilderV4Document, type StoryBuilderV4Section, type StorySectionType, type StoryTemplateSummaryV4 } from "./story-builder-v4.schema";
import type { WeddingSetup } from "./wedding.schema";

type AnyRecord = Record<string, unknown>;
const asRecord = (value: unknown): AnyRecord => value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string => typeof value === "string" ? value : "";
const id = () => globalThis.crypto?.randomUUID?.() ?? `section-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : undefined;
type TemplateSectionV4 = StoryTemplateSummaryV4["config"]["sections"][number];
type TemplateDefaultContent = NonNullable<TemplateSectionV4["defaultContent"]>;
type TemplateSectionStyle = NonNullable<TemplateSectionV4["style"]>;

function personFrom(value: unknown) {
  const source = asRecord(value);
  const social = asRecord(source.social);
  return {
    ...(text(source.displayName || source.name) ? { displayName: text(source.displayName || source.name) } : {}),
    ...(text(source.fullName) ? { fullName: text(source.fullName) } : {}),
    ...(text(source.photoUrl || source.photo) ? { photoUrl: text(source.photoUrl || source.photo) } : {}),
    ...(text(source.bio) ? { bio: text(source.bio) } : {}),
    ...(text(source.fatherName || source.father) ? { fatherName: text(source.fatherName || source.father) } : {}),
    ...(text(source.motherName || source.mother) ? { motherName: text(source.motherName || source.mother) } : {}),
    ...(text(social.facebook) || text(social.instagram) ? { social: {
      ...(text(social.facebook) ? { facebook: text(social.facebook) } : {}),
      ...(text(social.instagram) ? { instagram: text(social.instagram) } : {}),
    } } : {}),
  };
}

function legacySharedContent(raw: unknown, setup: WeddingSetup) {
  const root = asRecord(raw);
  const content = asRecord(root.content);
  const couple = asRecord(root.couple);
  const legacyEvents = Array.isArray(content.events) ? content.events : asArray(asRecord(root.events).items);
  const events = legacyEvents.map((item, index) => {
    const event = asRecord(item);
    const startsAt = validDate(text(event.startsAt || event.date));
    return {
      id: text(event.id) || `event-${index + 1}`,
      title: text(event.title || event.name) || "Sự kiện cưới",
      ...(startsAt ? { startsAt } : {}),
      ...(text(event.timeZoneId || setup.timeZoneId) ? { timeZoneId: text(event.timeZoneId || setup.timeZoneId) } : {}),
      ...(text(event.venueName || event.venue) ? { venueName: text(event.venueName || event.venue) } : {}),
      ...(text(event.address) ? { address: text(event.address) } : {}),
      ...(text(event.mapUrl) ? { mapUrl: text(event.mapUrl) } : {}),
    };
  });
  if (!events.length && setup.eventDateTime) events.push({
    id: "main-event", title: "Lễ cưới", startsAt: setup.eventDateTime, timeZoneId: setup.timeZoneId,
    ...(setup.venueName ? { venueName: setup.venueName } : {}), ...(setup.venueAddress ? { address: setup.venueAddress } : {}),
  });
  const groom = personFrom(content.groom ?? couple.groom);
  const bride = personFrom(content.bride ?? couple.bride);
  const oldGallery = Array.isArray(content.gallery) ? content.gallery : asArray(asRecord(root.gallery).images);
  const gallery = oldGallery.map((item, index) => {
    const image = typeof item === "string" ? item : text(asRecord(item).imageUrl);
    return image ? { id: text(asRecord(item).id) || `gallery-${index + 1}`, imageUrl: image,
      ...(text(asRecord(item).alt) ? { alt: text(asRecord(item).alt) } : {}) } : null;
  }).filter((item): item is NonNullable<typeof item> => item !== null);
  const oldStory = asRecord(content.loveStory ?? root.story);
  const oldItems = asArray(oldStory.items);
  const loveItems = oldItems.map((item, index) => {
    const entry = asRecord(item);
    const title = text(entry.title);
    if (!title) return null;
    return { id: text(entry.id) || `story-${index + 1}`, title, date: text(entry.date), body: text(entry.body),
      ...(text(entry.imageUrl || entry.image) ? { imageUrl: text(entry.imageUrl || entry.image) } : {}) };
  }).filter((item): item is NonNullable<typeof item> => item !== null);
  const oldGift = asRecord(content.gift ?? root.gift);
  const gift = {
    enabled: oldGift.enabled === true,
    ...(text(oldGift.groomBank) ? { groomBank: text(oldGift.groomBank) } : {}),
    ...(text(oldGift.groomHolder) ? { groomHolder: text(oldGift.groomHolder) } : {}),
    ...(text(oldGift.groomAccount) ? { groomAccount: text(oldGift.groomAccount) } : {}),
    ...(text(oldGift.brideBank) ? { brideBank: text(oldGift.brideBank) } : {}),
    ...(text(oldGift.brideHolder) ? { brideHolder: text(oldGift.brideHolder) } : {}),
    ...(text(oldGift.brideAccount) ? { brideAccount: text(oldGift.brideAccount) } : {}),
  };
  const coverImage = text(content.heroImageUrl || couple.coverImage || root.heroImageUrl);
  return {
    ...(Object.keys(groom).length ? { groom } : {}), ...(Object.keys(bride).length ? { bride } : {}),
    ...(events.length ? { events, mainEventId: text(content.mainEventId) || events[0]?.id } : {}),
    ...(gallery.length ? { gallery } : {}),
    ...(oldStory.enabled !== undefined || loveItems.length ? { loveStory: { enabled: oldStory.enabled !== false, intro: text(oldStory.intro || content.quote), items: loveItems } } : {}),
    ...(Object.keys(gift).length ? { gift } : {}),
    ...(coverImage ? { heroImageUrl: coverImage } : setup.coverImageUrl ? { heroImageUrl: setup.coverImageUrl } : {}),
    ...(root.wishes || content.wishesEnabled !== undefined ? { wishesEnabled: asRecord(root.wishes).enabled === true || content.wishesEnabled === true } : {}),
    eventsEnabled: events.length > 0, galleryEnabled: gallery.length > 0,
  };
}

function sectionContent(type: StorySectionType, content: ReturnType<typeof legacySharedContent>, setup: WeddingSetup, title: string) {
  switch (type) {
    case "hero": return { title: title || "Ngày vui của chúng mình", subtitle: "Trân trọng mời bạn cùng chung vui", ctaLabel: "Xem ngày vui", ...(content.heroImageUrl ? { imageUrl: content.heroImageUrl } : {}) };
    case "couple": return { title: "Cặp đôi", ...(content.groom ? { groom: structuredClone(content.groom) } : {}), ...(content.bride ? { bride: structuredClone(content.bride) } : {}) };
    case "countdown": return { title: "Đếm ngược đến ngày vui", ...(setup.eventDateTime ? { targetDate: setup.eventDateTime } : {}) };
    case "events": return { title: "Sự kiện cưới", ...(content.events?.length && content.events[0]?.id !== "main-event" ? { events: structuredClone(content.events) } : { eventIds: ["main"] }) };
    case "weddingParty": return { title: "Dàn phù dâu & phù rể", groom: [], bride: [] };
    case "loveStory": return { title: "Chuyện tình của chúng mình", ...(content.loveStory ? { intro: content.loveStory.intro, items: structuredClone(content.loveStory.items) } : { items: [] }) };
    case "gallery": return { title: "Album ảnh", images: structuredClone(content.gallery ?? []) };
    case "rsvp": return { title: "Xác nhận tham dự", submitLabel: "Mở thiệp mời" };
    case "wishes": return { title: "Lời chúc" };
    case "gift": return { title: "Mừng cưới" };
  }
}

function withTemplateDefaults(
  type: StorySectionType,
  content: Record<string, unknown>,
  defaults?: TemplateDefaultContent | null,
  showTemplateTitle = false,
): Record<string, unknown> {
  if (!defaults) return content;
  const next = { ...content };
  const genericTitles: Record<StorySectionType, string[]> = {
    hero: ["Trang chủ", "Ngày vui của chúng mình"], couple: ["Cặp đôi"], countdown: ["Đếm ngược đến ngày vui"],
    loveStory: ["Chuyện tình của chúng mình"], events: ["Sự kiện cưới"], weddingParty: ["Dàn phù dâu & phù rể"], gallery: ["Album ảnh"],
    rsvp: ["Xác nhận tham dự"], wishes: ["Lời chúc"], gift: ["Mừng cưới"],
  };
  if (defaults.title?.trim() && (!text(next.title).trim() || genericTitles[type].includes(text(next.title)) || showTemplateTitle)) {
    next.title = defaults.title;
  }
  if (defaults.intro?.trim() && !text(next.intro).trim()) next.intro = defaults.intro;
  if (type === "hero") {
    if (defaults.eyebrow?.trim() && !text(next.eyebrow).trim()) next.eyebrow = defaults.eyebrow;
    if (defaults.subtitle?.trim() && (!text(next.subtitle).trim() || text(next.subtitle) === "Trân trọng mời bạn cùng chung vui")) next.subtitle = defaults.subtitle;
  }
  if (type === "rsvp" && defaults.submitLabel?.trim() && (!text(next.submitLabel).trim() || text(next.submitLabel) === "Mở thiệp mời")) {
    next.submitLabel = defaults.submitLabel;
  }
  return next;
}

function makeSection(
  type: StorySectionType,
  variant: string,
  shared: ReturnType<typeof legacySharedContent>,
  setup: WeddingSetup,
  title: string,
  defaultContent?: TemplateDefaultContent | null,
  showTemplateTitle = false,
  style?: TemplateSectionStyle | null,
): StoryBuilderV4Section {
  const content = withTemplateDefaults(type, sectionContent(type, shared, setup, title) as Record<string, unknown>, defaultContent, showTemplateTitle);
  const base = { id: id(), type, variant, visible: true, content, ...(style ? { style } : {}) };
  if (type === "hero") return { ...base, type, variant: variant as "floral", bindings: [{ target: "heroImageUrl", source: "wedding.coverImageUrl", mode: "dynamic" }] } as StoryBuilderV4Section;
  if (type === "events") return { ...base, type, variant: variant as "cards", bindings: [
    { target: "mainEvent.startsAt", source: "wedding.mainEventAt", mode: "dynamic" },
    { target: "mainEvent.timeZoneId", source: "wedding.timeZoneId", mode: "dynamic" },
    { target: "mainEvent.venueName", source: "wedding.venueName", mode: "dynamic" },
    { target: "mainEvent.address", source: "wedding.venueAddress", mode: "dynamic" },
  ] } as StoryBuilderV4Section;
  if (type === "countdown") return { ...base, type, variant: variant as "classic", bindings: [{ target: "countdown.targetDate", source: "wedding.mainEventAt", mode: "dynamic" }] } as StoryBuilderV4Section;
  return base as StoryBuilderV4Section;
}

export function createStoryBuilderV4Document(
  template: StoryTemplateSummaryV4,
  setup: WeddingSetup,
  oldDocument?: unknown,
  options: { showTemplateDefaults?: boolean } = {},
): StoryBuilderV4Document {
  const shared = legacySharedContent(oldDocument, setup);
  const homeTitle = text(asRecord(oldDocument).title) || setup.name || "Trang chủ";
  const sections = template.config.sections.map(section => makeSection(
    section.type as StorySectionType, section.variant, shared, setup, homeTitle, section.defaultContent, options.showTemplateDefaults, section.style,
  ));
  const hasHero = sections.some(section => section.type === "hero");
  const safeSections = hasHero ? sections : [makeSection("hero", "floral", shared, setup, homeTitle), ...sections];
  const document = {
    kind: "wedding-website" as const, schemaVersion: 4 as const, builderVersion: 2 as const,
    templateKey: template.key, templateVersion: template.version, templateSnapshot: template.config,
    navigationMode: "one-page" as const, content: shared,
    appearance: {
      paletteId: template.config.palettes[0]?.id,
      fontHeading: template.config.theme.fontHeading,
      fontBody: template.config.theme.fontBody,
      motion: "template" as const,
      guestExperience: {
        tools: template.config.guestExperienceDefaults?.tools ?? ["rsvp", "calendar", "gift", "wishes"],
        decoration: template.config.guestExperienceDefaults?.decoration ?? "none",
        intensity: template.config.guestExperienceDefaults?.intensity ?? "light",
      },
    },
    pages: [{ id: id(), slug: "", title: homeTitle, navigationLabel: "Trang chủ", visible: true, isHome: true, sections: safeSections }],
  };
  return storyBuilderV4DocumentSchema.parse(document);
}

/** Apply a different visual template while preserving the existing draft's pages and content. */
export function applyStoryBuilderV4Template(
  template: StoryTemplateSummaryV4,
  current: StoryBuilderV4Document,
  setup: WeddingSetup,
): StoryBuilderV4Document {
  const supportedTypes = new Set<StorySectionType>(["hero", "couple", "countdown", "loveStory", "events", "weddingParty", "gallery", "rsvp", "wishes", "gift"]);
  const layouts = template.config.sections.map(item => {
    if (!supportedTypes.has(item.type as StorySectionType)) throw new Error(`Mẫu có loại phần chưa được hỗ trợ: ${item.type}`);
    return { type: item.type as StorySectionType, variant: item.variant, defaultContent: item.defaultContent, style: item.style };
  });
  if (!layouts.some(item => item.type === "hero")) layouts.unshift({ type: "hero", variant: "floral", defaultContent: undefined, style: undefined });

  const remappedPages = current.pages.map(page => {
    const unmatched = structuredClone(page.sections);
    const configured = layouts.map(layout => {
      const existingIndex = unmatched.findIndex(section => section.type === layout.type);
      const existing = existingIndex >= 0 ? unmatched.splice(existingIndex, 1)[0] : undefined;
      if (existing) return { ...existing, variant: layout.variant, style: layout.style ?? undefined } as StoryBuilderV4Section;
      const created = makeSection(layout.type, layout.variant, current.content as ReturnType<typeof legacySharedContent>, setup, page.title, layout.defaultContent, false, layout.style);
      return created;
    });

    // Keep sections not present in the chosen template so their content remains recoverable.
    // They start hidden to avoid unexpectedly mixing the previous layout into the new design.
    const retained = unmatched.map(section => ({ ...section, visible: false, style: undefined } as StoryBuilderV4Section));
    const sections = [...configured, ...retained];
    const heroIndex = sections.findIndex(section => section.type === "hero");
    if (heroIndex > 0) {
      const [hero] = sections.splice(heroIndex, 1);
      if (hero) sections.unshift(hero);
    }
    return { ...page, sections };
  });

  return storyBuilderV4DocumentSchema.parse({
    ...current,
    templateKey: template.key,
    templateVersion: template.version,
    templateSnapshot: template.config,
    appearance: {
      ...current.appearance,
      paletteId: template.config.palettes[0]?.id,
      fontHeading: template.config.theme.fontHeading,
      fontBody: template.config.theme.fontBody,
    },
    pages: remappedPages,
  });
}

export type StoryBuilderV4TemplateImpact = {
  pagesPreserved: number;
  sectionsPreserved: number;
  hiddenSections: { pageId: string; pageTitle: string; sectionId: string; sectionType: StorySectionType }[];
  addedSections: { pageId: string; pageTitle: string; sectionId: string; sectionType: StorySectionType }[];
  changedVariants: number;
  themeChanged: boolean;
};

export function summarizeStoryBuilderV4TemplateChange(current: StoryBuilderV4Document, next: StoryBuilderV4Document): StoryBuilderV4TemplateImpact {
  const impact: StoryBuilderV4TemplateImpact = { pagesPreserved: 0, sectionsPreserved: 0, hiddenSections: [], addedSections: [], changedVariants: 0, themeChanged: false };
  for (const page of current.pages) {
    const nextPage = next.pages.find(item => item.id === page.id);
    if (!nextPage) continue;
    impact.pagesPreserved += 1;
    for (const section of page.sections) {
      const updated = nextPage.sections.find(item => item.id === section.id);
      if (!updated) continue;
      impact.sectionsPreserved += 1;
      if (section.visible !== false && updated.visible === false) impact.hiddenSections.push({ pageId: page.id, pageTitle: page.title, sectionId: section.id, sectionType: section.type });
      if (updated.variant !== section.variant) impact.changedVariants += 1;
    }
    for (const section of nextPage.sections) {
      if (!page.sections.some(item => item.id === section.id)) impact.addedSections.push({ pageId: page.id, pageTitle: page.title, sectionId: section.id, sectionType: section.type });
    }
  }
  impact.themeChanged = current.templateKey !== next.templateKey || current.appearance.paletteId !== next.appearance.paletteId || current.appearance.fontHeading !== next.appearance.fontHeading || current.appearance.fontBody !== next.appearance.fontBody;
  return impact;
}

export function isStoryBuilderV4Document(value: unknown): value is StoryBuilderV4Document {
  return storyBuilderV4DocumentSchema.safeParse(value).success;
}

export function createV4Section(
  type: StorySectionType,
  shared: StoryBuilderV4Document["content"],
  setup: WeddingSetup,
  defaultContent?: TemplateDefaultContent | null,
  style?: TemplateSectionStyle | null,
): StoryBuilderV4Section {
  const variants: Record<StorySectionType, string> = { hero: "floral", couple: "alternating", countdown: "classic", loveStory: "timeline", events: "cards", weddingParty: "classic", gallery: "grid", rsvp: "default", wishes: "default", gift: "default" };
  return makeSection(type, variants[type], shared as ReturnType<typeof legacySharedContent>, setup, "", defaultContent, false, style);
}
