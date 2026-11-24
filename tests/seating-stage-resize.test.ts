import test from "node:test";
import assert from "node:assert/strict";
import { resizeStage } from "../src/features/guests/utils/seating-stage-resize";
import { seatingPlanSchema } from "../src/features/guests/api/planning-seating.api";

test("stage scales at all four corners, preserving its ratio and opposite corner", () => {
  const bounds = { x: 100, y: 200, width: 250, height: 160 };
  for (const west of [true, false])
    for (const north of [true, false]) {
      const anchor = { x: bounds.x + (west ? 250 : 0), y: bounds.y + (north ? 160 : 0) };
      const resized = resizeStage(
        bounds,
        { x: anchor.x + (west ? -500 : 500), y: anchor.y + (north ? -320 : 320) },
        { west, north },
      );
      assert.equal(resized.width, 500);
      assert.equal(resized.height, 320);
      assert.equal(resized.x + (west ? resized.width : 0), anchor.x);
      assert.equal(resized.y + (north ? resized.height : 0), anchor.y);
      const crossed = resizeStage(bounds, { x: anchor.x, y: anchor.y }, { west, north });
      assert.equal(crossed.width, 125);
      assert.equal(crossed.height, 80);
    }
});

test("canvas accepts legacy stage sizes, retains saved dimensions and rejects incomplete sizes", () => {
  const base = { weddingId: "w", version: 0, tables: [], guests: [], places: [], assignments: [] };
  const canvas = {
    splitZones: false,
    tables: {},
    zones: {},
    stage: { x: 10, y: 20 },
    objects: [{ id: "s", type: "stage", x: 30, y: 40, width: 500, height: 320 }],
  };
  const parsed = seatingPlanSchema.parse({ ...base, canvasLayout: canvas }).canvasLayout!;
  assert.equal(parsed.stage?.width, undefined);
  assert.equal(parsed.objects[0]?.width, 500);
  for (const size of [
    { width: 500, height: 320 },
    { width: null, height: null },
  ])
    assert.ok(
      seatingPlanSchema.safeParse({
        ...base,
        canvasLayout: { ...canvas, stage: { ...canvas.stage, ...size } },
      }).success,
    );
  for (const size of [{ width: 500 }, { width: 0, height: 320 }, { width: -1, height: 320 }])
    assert.equal(
      seatingPlanSchema.safeParse({
        ...base,
        canvasLayout: { ...canvas, stage: { ...canvas.stage, ...size } },
      }).success,
      false,
    );
});
