import { z } from "zod";

const image = z.string().max(2048);

export const weddingStorySchema = z.object({
  schemaVersion: z.literal(2),
  templateId: z.string().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  paletteId: z.string().max(40).optional(),
  fontHeading: z.string().max(80).optional(),
  fontBody: z.string().max(80).optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  motion: z.enum(["template", "off"]),
  mainEventId: z.string().max(100).optional(),
  storyTemplate: z.object({
    key: z.string(), version: z.number(),
    sections: z.array(z.object({ type: z.string(), variant: z.string() })),
    theme: z.object({ primary: z.string(), background: z.string(), accent: z.string(), text: z.string(), fontHeading: z.string(), fontBody: z.string() }),
    publishedAt: z.string(),
  }).optional(),
  couple: z.object({
    date: z.string().max(40),
    coverImage: image,
    slides: z.array(image).max(3).optional(),
    groom: z.object({ name: z.string().max(100), shortName: z.string().max(50).optional(), photo: image, bio: z.string().max(2000), father: z.string().max(100).optional(), mother: z.string().max(100).optional(), social: z.object({ facebook: z.string().max(2048).optional(), instagram: z.string().max(2048).optional() }).optional() }),
    bride: z.object({ name: z.string().max(100), shortName: z.string().max(50).optional(), photo: image, bio: z.string().max(2000), father: z.string().max(100).optional(), mother: z.string().max(100).optional(), social: z.object({ facebook: z.string().max(2048).optional(), instagram: z.string().max(2048).optional() }).optional() }),
  }),
  video: z.object({ enabled: z.boolean(), url: z.string().max(2048), coverImage: image }).optional(),
  quote: z.string().max(500).optional(),
  party: z.object({ enabled: z.boolean(), members: z.array(z.object({ id: z.string().max(100), name: z.string().max(100), role: z.enum(["bridesmaid", "groomsman"]), bio: z.string().max(1000), image: image })).max(12) }).optional(),
  story: z.object({
    enabled: z.boolean(),
    items: z
      .array(
        z.object({
          id: z.string().max(100),
          date: z.string().max(50),
          title: z.string().max(150),
          body: z.string().max(3000),
          image: image,
        }),
      )
      .max(20),
  }),
  events: z.object({
    enabled: z.boolean(),
    items: z
      .array(
        z.object({
          id: z.string().max(100),
          title: z.string().max(150),
          date: z.string().max(50),
          venue: z.string().max(150),
          address: z.string().max(300),
          mapUrl: z.string().max(2048),
        }),
      )
      .max(20),
  }),
  gallery: z.object({ enabled: z.boolean(), images: z.array(image).max(30) }),
  wishes: z.object({ enabled: z.boolean() }),
  gift: z.object({
    enabled: z.boolean(),
    groomBank: z.string().max(100),
    groomHolder: z.string().max(100),
    groomAccount: z.string().max(100),
    brideBank: z.string().max(100),
    brideHolder: z.string().max(100),
    brideAccount: z.string().max(100),
  }),
});

export type WeddingStoryDocument = z.infer<typeof weddingStorySchema>;

export const starterWeddingStory: WeddingStoryDocument = {
  schemaVersion: 2,
  templateId: "romantic",
  paletteId: "blush",
  accent: "#647895",
  motion: "template",
  mainEventId: "wedding-day",
  couple: {
    date: "2026-11-28",
    coverImage: "/images/template-studio/story-collection/photo-39.webp",
    slides: ["/images/template-studio/story-collection/photo-39.webp", "/images/template-studio/story-collection/photo-39-walk.webp"],
    groom: {
      name: "Minh An",
      shortName: "An",
      photo: "/images/template-studio/story-collection/photo-39-groom.webp",
      bio: "Người luôn tin rằng những điều đẹp nhất bắt đầu từ một cuộc gặp tình cờ.",
    },
    bride: {
      name: "Hà My",
      shortName: "My",
      photo: "/images/template-studio/story-collection/photo-39-bride.webp",
      bio: "Cô gái yêu hoa, những chuyến đi và những buổi chiều bình yên bên người mình thương.",
    },
  },
  video: { enabled: false, url: "", coverImage: "/images/template-studio/story-collection/photo-39-walk.webp" },
  quote: "Từ ngày gặp nhau, mọi hành trình đều trở nên đẹp hơn khi có hai đứa cùng đi.",
  party: { enabled: false, members: [] },
  story: {
    enabled: true,
    items: [
      {
        id: "first-meeting",
        date: "14.02.2024",
        title: "Ngày đầu gặp nhau",
        body: "Một cuộc gặp tình cờ đã mở ra câu chuyện mà chúng mình muốn kể mãi về sau.",
        image: "/images/template-studio/story-collection/photo-39-walk.webp",
      },
      {
        id: "first-journey",
        date: "20.07.2024",
        title: "Chuyến đi đầu tiên",
        body: "Chúng mình cùng khám phá một nơi mới, chia sẻ những câu chuyện nhỏ và nhận ra niềm vui giản dị nhất là có nhau bên cạnh.",
        image: "/images/template-studio/story-collection/photo-39.webp",
      },
      {
        id: "our-promise",
        date: "12.06.2026",
        title: "Lời hứa của hai đứa",
        body: "Từ những ngày bình thường nhất đến những cột mốc quan trọng, hai đứa chọn tiếp tục đồng hành cùng nhau.",
        image: "/images/template-studio/story-collection/photo-39-walk.webp",
      },
    ],
  },
  events: {
    enabled: true,
    items: [
      {
        id: "wedding-day",
        title: "Lễ thành hôn",
        date: "2026-11-28T10:30:00+07:00",
        venue: "Địa điểm tổ chức",
        address: "Địa chỉ chi tiết",
        mapUrl: "",
      },
    ],
  },
  gallery: {
    enabled: true,
    images: [
      "/images/template-studio/story-collection/photo-39.webp",
      "/images/template-studio/story-collection/photo-39-walk.webp",
    ],
  },
  wishes: { enabled: true },
  gift: { enabled: false, groomBank: "", groomHolder: "", groomAccount: "", brideBank: "", brideHolder: "", brideAccount: "" },
};

export function isWeddingStoryDocument(value: unknown): value is WeddingStoryDocument {
  return weddingStorySchema.safeParse(value).success;
}
