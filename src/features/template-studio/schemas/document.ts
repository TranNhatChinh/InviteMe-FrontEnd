import { z } from "zod";
import {
  validManualGiftRecipient,
  giftSettingsSchema,
} from "@/shared/api/invitation-gift-settings";
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
export type { GiftSettings } from "@/shared/api/invitation-gift-settings";
const props = z
  .object({
    gift: giftSettingsSchema.optional(),
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

export const importedPageSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    imageUrl: assetSource,
    width: z.number().int().positive().max(30000),
    height: z.number().int().positive().max(30000),
    order: z.number().int().min(0).max(23),
  })
  .strict()
  .refine((page) => page.width * page.height <= 100_000_000);
export type ImportedPage = z.infer<typeof importedPageSchema>;

export const importedWidgetSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    pageId: z.string().trim().min(1).max(100),
    type: z.enum(["RSVP", "GIFT"]),
    enabled: z.boolean(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.1).max(1),
    height: z.number().min(0.001).max(1),
    label: z.string().trim().min(1).max(80),
    backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    textColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  })
  .strict()
  .refine((widget) => widget.x + widget.width <= 1 + 1e-9 && widget.y + widget.height <= 1 + 1e-9);
export type ImportedWidget = z.infer<typeof importedWidgetSchema>;

export const studioDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(["TEMPLATE", "IMPORTED"]).optional(),
    pages: z.array(importedPageSchema).min(1).max(24).optional(),
    widgets: z.array(importedWidgetSchema).max(24).optional(),
    templateId: z.string().max(100).optional(),
    nodes: z.record(z.string(), node),
  })
  .strict()
  .superRefine(({ nodes, kind, pages, widgets, templateId }, ctx) => {
    const root = nodes.ROOT;
    const invalid = () => ctx.addIssue({ code: "custom", message: "Cây item không hợp lệ." });
    if (kind === "IMPORTED") {
      if (
        !pages ||
        templateId !== undefined ||
        Object.keys(nodes).length !== 1 ||
        new Set(pages.map((page) => page.id)).size !== pages.length ||
        pages.some(
          (page, index) =>
            page.order !== index || builtinAssetSource.safeParse(page.imageUrl).success,
        ) ||
        Object.keys(root?.props ?? {}).some(
          (key) => key !== "music" && key !== "particles" && key !== "gift",
        )
      )
        invalid();
      if (
        widgets &&
        (new Set(widgets.map((widget) => widget.id)).size !== widgets.length ||
          widgets.some((widget) => !pages?.some((page) => page.id === widget.pageId)))
      )
        invalid();
    } else if (pages !== undefined || widgets !== undefined) invalid();
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
      if (item.props.gift && id !== "ROOT") invalid();
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

export function giftConfigurationError(
  document: z.infer<typeof studioDocumentSchema>,
  options: { template?: boolean } = {},
): string | null {
  if (options.template) return null;
  const active =
    document.widgets?.some((w) => w.type === "GIFT" && w.enabled) ||
    Object.values(document.nodes).some(
      (n) => !n.hidden && n.type.resolvedName === "StudioAction" && n.props.action === "gift",
    );
  if (!active) return null;
  const gift = document.nodes.ROOT?.props.gift;
  if (!gift || !gift.recipients.some((r) => r.enabled))
    return "Hộp quà mừng chưa được cấu hình. Chọn ít nhất một mã QR hoặc ẩn/xóa widget trước khi lưu hoặc xuất bản.";
  for (const r of gift.recipients.filter((r) => r.enabled)) {
    if (gift.mode === "UPLOADED" && !r.imageUrl)
      return `Vui lòng tải ảnh QR của ${r.role === "BRIDE" ? "cô dâu" : "chú rể"} hoặc tắt hiển thị mã này.`;
    if (gift.mode === "MANUAL" && !validManualGiftRecipient(r))
      return `Vui lòng chọn ngân hàng, nhập STK từ 4–30 chữ số của ${r.role === "BRIDE" ? "cô dâu" : "chú rể"}.`;
    if (gift.mode === "LINKED" && !r.accountId)
      return `Vui lòng chọn tài khoản đã liên kết cho ${r.role === "BRIDE" ? "cô dâu" : "chú rể"} hoặc tắt hiển thị mã này.`;
  }
  const ids = gift.recipients.filter((r) => r.enabled && r.accountId).map((r) => r.accountId);
  return new Set(ids).size !== ids.length
    ? "Hai mã QR phải sử dụng hai tài khoản khác nhau."
    : null;
}
