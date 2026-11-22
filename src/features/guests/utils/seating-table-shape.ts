import type { TableShape } from "../api/planning-seating.api";

/** Seat numbers stay stable; only their visual positions change with the table shape. */
export function tableSeatPoint(shape: TableShape, index: number, capacity: number) {
  if (shape === "round") {
    const angle = (index / capacity) * Math.PI * 2 - Math.PI / 2;
    return { x: 50 + 43 * Math.cos(angle), y: 50 + 43 * Math.sin(angle) };
  }
  const ends = shape === "fourSided" ? 2 : 0;
  const longSeats = capacity - ends;
  const upper = Math.ceil(longSeats / 2);
  const lower = longSeats - upper;
  const spread = (position: number, count: number) =>
    count === 1 ? 50 : 8 + (position * 84) / (count - 1);
  if (index < upper) return { x: spread(index, upper), y: 9 };
  if (index < longSeats) return { x: spread(index - upper, lower), y: 91 };
  return { x: index === longSeats ? 5 : 95, y: 50 };
}
