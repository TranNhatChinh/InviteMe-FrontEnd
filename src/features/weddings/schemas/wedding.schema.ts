import { z } from "zod";

export const WEDDING_TIME_ZONE = "Asia/Ho_Chi_Minh";
export const RESERVED_WEDDING_SLUGS = new Set([
  "admin",
  "api",
  "auth",
  "guest-invitations",
  "health",
  "hubs",
  "login",
  "register",
  "rsvp",
  "swagger",
  "weddings",
  "www",
]);

export type WeddingSlugMessages = {
  min: string;
  max: string;
  pattern: string;
  reserved: string;
};

// Validation messages in this module are i18n keys; UI forms pass translated messages or translate at display.
const defaultSlugMessages: WeddingSlugMessages = {
  min: "weddings:validation.slugMin",
  max: "weddings:validation.slugMax",
  pattern: "weddings:validation.slugPattern",
  reserved: "weddings:validation.slugReserved",
};

export function createWeddingSlugSchema(messages: WeddingSlugMessages = defaultSlugMessages) {
  return z
    .string()
    .min(3, messages.min)
    .max(80, messages.max)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, messages.pattern)
    .refine((value) => !RESERVED_WEDDING_SLUGS.has(value), messages.reserved);
}

export const weddingSlugSchema = createWeddingSlugSchema();

export const weddingSetupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  eventDateTime: z.iso.datetime({ offset: true }).nullable(),
  venueName: z.string().nullable(),
  venueAddress: z.string().nullable(),
  capacity: z.number().int().positive().nullable(),
  rsvpDeadline: z.iso.datetime({ offset: true }).nullable(),
  coverImageUrl: z.string().nullable(),
  timeZoneId: z.string(),
  status: z.string(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type WeddingSetup = z.infer<typeof weddingSetupSchema>;

const weddingInputShape = z.object({
  name: z
    .string()
    .trim()
    .min(1, "weddings:validation.nameRequired")
    .max(200, "weddings:validation.nameMax"),
  slug: weddingSlugSchema,
  eventDateTime: z.iso.datetime({ offset: true }),
  venueName: z
    .string()
    .trim()
    .min(1, "weddings:validation.venueRequired")
    .max(200, "weddings:validation.venueMax"),
  venueAddress: z
    .string()
    .trim()
    .min(1, "weddings:validation.addressRequired")
    .max(2000, "weddings:validation.addressMax"),
  capacity: z.number().int().positive("weddings:validation.capacityPositive"),
  rsvpDeadline: z.iso.datetime({ offset: true }),
});

function deadlineMustNotFollowEvent<T extends { eventDateTime: string; rsvpDeadline: string }>(
  value: T,
  ctx: z.RefinementCtx,
) {
  if (Date.parse(value.rsvpDeadline) > Date.parse(value.eventDateTime))
    ctx.addIssue({
      code: "custom",
      path: ["rsvpDeadline"],
      message: "weddings:validation.deadlineAfterEvent",
    });
}

export const weddingCreateInputSchema = weddingInputShape
  .extend({ coverImageUrl: z.null() })
  .superRefine(deadlineMustNotFollowEvent);

export const weddingUpdateInputSchema = weddingInputShape
  .extend({
    coverImageUrl: z.string().nullable(),
    expectedVersion: z.number().int().positive(),
  })
  .superRefine(deadlineMustNotFollowEvent);
export type WeddingCreateInput = z.infer<typeof weddingCreateInputSchema>;
export type WeddingUpdateInput = z.infer<typeof weddingUpdateInputSchema>;
export const weddingSlugAvailabilitySchema = z.object({ slug: z.string(), available: z.boolean() });
export const weddingCoverResultSchema = z.object({
  coverImageUrl: z.string().nullable(),
  version: z.number().int().positive(),
});

export const weddingSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  weddingDate: z.iso.date().nullable(),
  participantCount: z.number().int().nonnegative(),
  maxCapacity: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  coverImageUrl: z.string().nullable().optional(),
});
export const weddingListSchema = z.object({
  items: z.array(weddingSummarySchema),
  totalCount: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});
export type WeddingSummary = z.infer<typeof weddingSummarySchema>;

export function normalizeWeddingSlug(value: string) {
  return value.trim().toLowerCase();
}

export function slugFromWeddingName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

function datePartsAt(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function localDateTimeToIso(value: string, timeZone = WEDDING_TIME_ZONE) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("weddings:validation.invalidDateTime");
  const [, year, month, day, hour, minute] = match;
  const target = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  const offsetAt = (instant: number) => {
    const parts = datePartsAt(new Date(instant), timeZone);
    return (
      Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
      ) - instant
    );
  };
  const candidate = target - offsetAt(target);
  const check = datePartsAt(new Date(candidate), timeZone);
  if (
    Number(check.year) !== Number(year) ||
    Number(check.month) !== Number(month) ||
    Number(check.day) !== Number(day) ||
    Number(check.hour) !== Number(hour) ||
    Number(check.minute) !== Number(minute)
  )
    throw new Error("weddingEditor:validation.dateTimeNotInTimeZone");
  const offsetMinutes = Math.round(offsetAt(candidate) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  return `${year}-${month}-${day}T${hour}:${minute}:00${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, "0")}:${String(absoluteOffset % 60).padStart(2, "0")}`;
}

export function isoToLocalDateTime(value: string | null, timeZone = WEDDING_TIME_ZONE) {
  if (!value) return "";
  const parts = datePartsAt(new Date(value), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
