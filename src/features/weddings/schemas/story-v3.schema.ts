import { z } from "zod";
import type { WeddingStoryDocument } from "./wedding-story.schema";

const image = z.string().max(2048);
const person = z.object({
  displayName: z.string().max(50), fullName: z.string().max(100), photoUrl: image.optional(),
  bio: z.string().max(2000).optional(), fatherName: z.string().max(100).optional(),
  motherName: z.string().max(100).optional(),
  social: z.object({ facebook: z.string().max(2048).optional(), twitter: z.string().max(2048).optional(), instagram: z.string().max(2048).optional() }).optional(),
});
const event = z.object({ id: z.string().max(100), title: z.string().max(150),
  startsAt: z.string().max(50), venueName: z.string().max(150), address: z.string().max(300), mapUrl: z.string().max(2048).optional() });
export const weddingContentSchema = z.object({
  groom: person, bride: person, heroImageUrl: image.optional(), heroSlides: z.array(image).max(3).optional(),
  events: z.array(event).max(20), mainEventId: z.string().max(100), countdownTitle: z.string().max(150).optional(),
  eventsEnabled: z.boolean().optional(), galleryEnabled: z.boolean().optional(),
  gallery: z.array(z.object({ id: z.string().max(100), imageUrl: image, alt: z.string().max(200).optional() })).max(30),
  loveStory: z.object({ enabled: z.boolean(), intro: z.string().max(500).optional(), items: z.array(z.object({
    id: z.string().max(100), date: z.string().max(50), title: z.string().max(150),
    body: z.string().max(3000), imageUrl: image.optional(),
  })).max(20) }).optional(),
  wishesEnabled: z.boolean().optional(),
  gift: z.object({ enabled: z.boolean(), groomBank: z.string().max(100), groomHolder: z.string().max(100),
    groomAccount: z.string().max(100), brideBank: z.string().max(100), brideHolder: z.string().max(100),
    brideAccount: z.string().max(100) }).optional(),
});
export const storyAppearanceSchema = z.object({ paletteId: z.string().max(40).optional(),
  fontHeading: z.string().max(80).optional(), fontBody: z.string().max(80).optional(),
  motion: z.enum(["template", "off"]).optional() });
const section = z.object({ type: z.string(), variant: z.string() });
const theme = z.object({ primary: z.string(), background: z.string(), accent: z.string(), text: z.string(),
  fontHeading: z.string(), fontBody: z.string() });
export const storyDraftV3Schema = z.object({ schemaVersion: z.literal(3), templateKey: z.string().min(2).max(80),
  content: weddingContentSchema, appearance: storyAppearanceSchema });
export const storySnapshotV3Schema = z.object({ schemaVersion: z.literal(3), templateKey: z.string(),
  templateVersion: z.number(), sections: z.array(section), theme, content: weddingContentSchema,
  publishedAt: z.string() });
export type StoryDraftV3 = z.infer<typeof storyDraftV3Schema>;
export type StorySnapshotV3 = z.infer<typeof storySnapshotV3Schema>;

export function isStoryV3(value: unknown): value is StoryDraftV3 | StorySnapshotV3 {
  return typeof value === "object" && value !== null && "schemaVersion" in value && value.schemaVersion === 3;
}

export function toStoryDraftV3(doc: WeddingStoryDocument): StoryDraftV3 {
  const personFrom = (p: WeddingStoryDocument["couple"]["groom"]) => ({
    displayName: p.shortName || p.name, fullName: p.name, photoUrl: p.photo, bio: p.bio,
    fatherName: p.father, motherName: p.mother, social: p.social,
  });
  return {
    schemaVersion: 3, templateKey: doc.templateId,
    content: {
      groom: personFrom(doc.couple.groom), bride: personFrom(doc.couple.bride),
      heroImageUrl: doc.couple.coverImage, heroSlides: doc.couple.slides,
      events: doc.events.items.map((item) => ({ id: item.id, title: item.title, startsAt: item.date,
        venueName: item.venue, address: item.address, mapUrl: item.mapUrl })),
      mainEventId: doc.mainEventId ?? doc.events.items[0]?.id ?? "",
      eventsEnabled: doc.events.enabled, galleryEnabled: doc.gallery.enabled,
      gallery: doc.gallery.images.map((imageUrl, index) => ({ id: `image-${index}`, imageUrl })),
      loveStory: { enabled: doc.story.enabled, intro: doc.quote, items: doc.story.items.map((item) => ({
        id: item.id, date: item.date, title: item.title, body: item.body, imageUrl: item.image,
      })) },
      wishesEnabled: doc.wishes.enabled, gift: doc.gift,
    },
    appearance: { paletteId: doc.paletteId, fontHeading: doc.fontHeading,
      fontBody: doc.fontBody, motion: doc.motion },
  };
}

export function fromStoryV3(value: StoryDraftV3 | StorySnapshotV3): WeddingStoryDocument {
  const { content, templateKey } = value;
  const personTo = (p: typeof content.groom) => ({ name: p.fullName, shortName: p.displayName,
    photo: p.photoUrl ?? "", bio: p.bio ?? "", father: p.fatherName, mother: p.motherName, social: p.social });
  const appearance = "appearance" in value ? value.appearance : {};
  const main = content.events.find((event) => event.id === content.mainEventId) ?? content.events[0];
  return {
    schemaVersion: 2, templateId: templateKey, accent: "#805459", motion: appearance.motion ?? "template",
    paletteId: appearance.paletteId, fontHeading: appearance.fontHeading, fontBody: appearance.fontBody,
    mainEventId: content.mainEventId,
    couple: { date: main?.startsAt.slice(0, 10) ?? "", coverImage: content.heroImageUrl ?? "",
      slides: content.heroSlides, groom: personTo(content.groom), bride: personTo(content.bride) },
    quote: content.loveStory?.intro,
    story: { enabled: content.loveStory?.enabled ?? false, items: content.loveStory?.items.map((item) => ({
      id: item.id, date: item.date, title: item.title, body: item.body, image: item.imageUrl ?? "",
    })) ?? [] },
    events: { enabled: content.eventsEnabled ?? true, items: content.events.map((item) => ({ id: item.id, title: item.title,
      date: item.startsAt, venue: item.venueName, address: item.address, mapUrl: item.mapUrl ?? "" })) },
    gallery: { enabled: content.galleryEnabled ?? true, images: content.gallery.map((item) => item.imageUrl) },
    wishes: { enabled: content.wishesEnabled ?? false },
    gift: content.gift ?? { enabled: false, groomBank: "", groomHolder: "", groomAccount: "",
      brideBank: "", brideHolder: "", brideAccount: "" },
    storyTemplate: "sections" in value ? { key: value.templateKey, version: value.templateVersion,
      sections: value.sections, theme: value.theme, publishedAt: value.publishedAt } : undefined,
  };
}
