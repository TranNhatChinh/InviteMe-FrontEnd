import { z } from "zod";
import { isValidEventDate } from "../components/date-utils";
import { musicSettingsSchema } from "@/shared/api/music.api";
import { particleEffects } from "../components/particle-settings";

const builtinAssetSource = z
  .string()
  .regex(
    /^(?:\/images\/templates\/(?:invite-portrait|story-meadow)\.png|\/images\/template-studio\/minimalism-brown\/[a-z0-9-]+\.webp|\/images\/template-studio\/minimalism-burgundy\/(?:photo\.png|(?:envelope|paper|botanical)\.svg)|\/images\/template-studio\/collection\/[a-z0-9-]+\.(?:webp|svg)|\/images\/template-studio\/story-collection\/[a-z0-9-]+\.(?:webp|svg)|\/images\/template-studio\/story-red-velvet\/photo\.png|\/api\/template-studio\/assets\?id=[a-f0-9-]{36})$/,
  );
const assetSource = z
  .string()
  .refine(
    (source) =>
      builtinAssetSource.safeParse(source).success ||
      source.startsWith("/media/") ||
      /^https?:\/\//.test(source),
    "Nguồn ảnh không hợp lệ.",
  );
const props = z
  .object({
    music: musicSettingsSchema.optional(),
    particles: z.enum(particleEffects).optional(),
    cover: z
      .object({
        enabled: z.boolean(),
        style: z.enum(["floral", "traditional", "botanical"]).optional(),
        particles: z.enum(["none", "hearts", "leaves", "happiness"]).optional(),
        opening: z.enum(["seal", "fly", "fade"]).optional(),
        names: z.string().max(150),
        greeting: z.string().max(300).optional(),
        greetingBinding: z.literal("invitationWording").optional(),
        date: z.string().max(100),
        background: z.string().regex(/^#[0-9a-f]{6}$/i),
        decoration: assetSource.optional(),
      })
      .strict()
      .optional(),
    revealPreset: z.enum(["none", "fade", "slide-up", "scale-in"]).optional(),
    revealDuration: z.number().min(100).max(3000).optional(),
    revealDelay: z.number().min(0).max(3000).optional(),
    x: z.number().min(-3000).max(3000).optional(),
    y: z.number().min(-3000).max(10000).optional(),
    width: z.number().min(20).max(2000).optional(),
    height: z.number().min(20).max(10000).optional(),
    rotation: z.number().min(-3600).max(3600).optional(),
    text: z.string().max(10000).optional(),
    textBinding: z.literal("invitationWording").optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strike: z.boolean().optional(),
    uppercase: z.boolean().optional(),
    textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
    lineHeight: z.number().min(0.8).max(3).optional(),
    opacity: z.number().min(0).max(1).optional(),
    eventDate: z.string().refine(isValidEventDate).optional(),
    eventTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    timezone: z.enum(["Asia/Ho_Chi_Minh", "UTC"]).optional(),
    fontFamily: z.enum(["Arial", "Georgia", "EB Garamond"]).optional(),
    objectFit: z.enum(["cover", "contain"]).optional(),
    borderRadius: z.number().min(0).max(1000).optional(),
    imageShape: z.enum(["rectangle", "arch", "oval", "scallop"]).optional(),
    flipX: z.boolean().optional(),
    address: z.string().max(500).optional(),
    action: z.enum(["rsvp", "calendar", "gift"]).optional(),
    message: z.string().max(2000).optional(),
    questions: z
      .array(z.object({ question: z.string().max(150), answer: z.string().max(600) }).strict())
      .min(1)
      .max(8)
      .optional(),
    milestones: z
      .array(
        z
          .object({
            time: z.string().max(40),
            title: z.string().max(120),
            description: z.string().max(220),
          })
          .strict(),
      )
      .min(1)
      .max(8)
      .optional(),
    images: z.array(assetSource).min(1).max(100).optional(),
    title: z.string().max(150).optional(),
    accent: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    fontSize: z.number().min(8).max(200).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    background: z
      .string()
      .regex(/^(?:#[0-9a-f]{6}|transparent)$/i)
      .optional(),
    backgroundGradient: z
      .string()
      .regex(/^linear-gradient\(135deg, #[0-9a-f]{6}, #[0-9a-f]{6}\)$/i)
      .optional(),
    src: assetSource.optional(),
  })
  .strict();

const node = z
  .object({
    type: z
      .object({
        resolvedName: z.enum([
          "StudioFrame",
          "StudioText",
          "StudioImage",
          "StudioCalendar",
          "StudioCountdown",
          "StudioAlbum",
          "StudioMap",
          "StudioAction",
          "StudioWishes",
          "StudioInterview",
          "StudioTimeline",
        ]),
      })
      .strict(),
    isCanvas: z.boolean(),
    props,
    displayName: z.string(),
    custom: z.object({}).strict(),
    hidden: z.boolean(),
    nodes: z.array(z.string()).max(100),
    linkedNodes: z.object({}).strict(),
    parent: z.string().optional(),
  })
  .strict();

export const studioDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    templateId: z.string().max(100).optional(),
    nodes: z.record(z.string(), node),
  })
  .strict()
  .superRefine(({ nodes }, ctx) => {
    const root = nodes.ROOT;
    const invalid = () => ctx.addIssue({ code: "custom", message: "Cây item không hợp lệ." });
    if (
      !root ||
      root.type.resolvedName !== "StudioFrame" ||
      !root.isCanvas ||
      root.parent !== undefined ||
      Object.keys(nodes).length > 101
    ) {
      invalid();
      return;
    }
    const children = new Set(root.nodes);
    if (
      children.size !== root.nodes.length ||
      children.has("ROOT") ||
      Object.keys(nodes).length !== children.size + 1
    )
      invalid();
    for (const [id, item] of Object.entries(nodes)) {
      if (item.props.music && id !== "ROOT") invalid();
      if (item.props.particles !== undefined && id !== "ROOT") invalid();
      if (item.props.textBinding && item.type.resolvedName !== "StudioText") invalid();
      if (id === "ROOT") continue;
      if (
        !children.has(id) ||
        item.parent !== "ROOT" ||
        item.isCanvas ||
        item.nodes.length ||
        item.type.resolvedName === "StudioFrame"
      )
        invalid();
    }
    for (const id of children) if (!nodes[id]) invalid();
  });

export function parseStudioDocument(value: string) {
  if (value.length > 500000) throw new Error("Document quá lớn.");
  return studioDocumentSchema.parse(JSON.parse(value));
}
