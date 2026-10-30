import { z } from "zod";

const presenceFields = {
  userId: z.string(),
  connectionId: z.string(),
  dragId: z.string(),
  displayName: z.string(),
  placeIds: z.array(z.string()),
  expiresAt: z.string().datetime({ offset: true }),
  tableId: z.string().nullable(),
  seatNumber: z.number().int().nullable(),
  targetSequence: z.number().int().nonnegative().optional(),
};
export const seatingDragLeaseSchema = z.object({
  ...presenceFields,
  token: z.string(),
  weddingId: z.string(),
});
export const seatingDragSnapshotSchema = z.object({
  weddingId: z.string(),
  revision: z.number().int().nonnegative(),
  leases: z.array(z.object(presenceFields)),
});
export type SeatingDragLease = z.infer<typeof seatingDragLeaseSchema>;
export type SeatingDragSnapshot = z.infer<typeof seatingDragSnapshotSchema>;
export type SeatingDragPresence = SeatingDragSnapshot["leases"][number];
export const seatingDragPointerSchema = z.object({
  weddingId: z.string(),
  connectionId: z.string(),
  dragId: z.string(),
  anchor: z.string().regex(/^(queue|board|table:[a-f0-9-]{36})$/i),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  sequence: z.number().int().nonnegative(),
  tableId: z.string().nullable().optional(),
  seatNumber: z.number().int().min(1).max(20).nullable().optional(),
  hasTarget: z.boolean().optional(),
});
export type SeatingDragPointer = z.infer<typeof seatingDragPointerSchema>;
