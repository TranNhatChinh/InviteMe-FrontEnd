import type { WeddingSetup } from "../schemas/wedding.schema";

export const storyTemplatePreviewSetup: WeddingSetup = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "An & Minh",
  slug: "an-minh-preview",
  eventDateTime: "2027-12-18T10:00:00+07:00",
  venueName: "Nhà hàng Hoa Viên",
  venueAddress: "Quận 1, Thành phố Hồ Chí Minh",
  capacity: null,
  rsvpDeadline: "2027-12-11T10:00:00+07:00",
  coverImageUrl: "/images/template-studio/story-collection/photo-39.webp",
  timeZoneId: "Asia/Ho_Chi_Minh",
  status: "DRAFT",
  version: 1,
  createdAt: "2026-01-01T00:00:00+07:00",
  updatedAt: "2026-01-01T00:00:00+07:00",
};

export const storyTemplatePreviewContent = {
  title: "An & Minh",
  content: {
    heroImageUrl: "/images/template-studio/story-collection/photo-39.webp",
    groom: {
      displayName: "Minh",
      photoUrl: "/images/template-studio/story-collection/photo-39-groom.webp",
    },
    bride: {
      displayName: "An",
      photoUrl: "/images/template-studio/story-collection/photo-39-bride.webp",
    },
    events: [
      {
        id: "wedding-day",
        title: "Lễ thành hôn",
        startsAt: "2027-12-18T10:00:00+07:00",
        timeZoneId: "Asia/Ho_Chi_Minh",
        venueName: "Nhà hàng Hoa Viên",
        address: "Quận 1, Thành phố Hồ Chí Minh",
      },
    ],
    loveStory: {
      enabled: true,
      intro: "Một ngày bình thường đã mở ra câu chuyện đặc biệt.",
      items: [],
    },
    gallery: [
      {
        id: "preview-photo",
        imageUrl: "/images/template-studio/story-collection/photo-39.webp",
        alt: "Ảnh cưới xem thử",
      },
    ],
    gift: { enabled: false },
    wishesEnabled: true,
  },
};
