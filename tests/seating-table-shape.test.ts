import test from "node:test";
import assert from "node:assert/strict";
import { tableSeatPoint } from "../src/features/guests/utils/seating-table-shape";
import {
  seatingCapacities,
  seatingPlanSchema,
  type TableShape,
} from "../src/features/guests/api/planning-seating.api";

test("table shapes place every capacity on the chosen sides without duplicate seats", () => {
  for (const capacity of seatingCapacities)
    for (const shape of ["round", "twoSided", "fourSided"] as TableShape[]) {
      const points = Array.from({ length: capacity }, (_, i) => tableSeatPoint(shape, i, capacity));
      assert.equal(new Set(points.map((point) => `${point.x}:${point.y}`)).size, capacity);
      assert.ok(
        points.every(
          (point) =>
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            point.x >= 0 &&
            point.x <= 100 &&
            point.y >= 0 &&
            point.y <= 100,
        ),
      );
      if (shape === "twoSided") assert.ok(points.every((point) => point.y === 9 || point.y === 91));
      if (shape === "fourSided") assert.equal(points.filter((point) => point.y === 50).length, 2);
    }
});
test("canvas contract preserves table shape and accepts legacy layouts without it", () => {
  const plan = {
    weddingId: "w",
    version: 1,
    tables: [],
    guests: [],
    places: [],
    assignments: [],
    canvasLayout: {
      splitZones: false,
      tables: { t: { x: 10, y: 20 } },
      zones: {},
      stage: null,
      objects: [],
    },
  };
  assert.equal(seatingPlanSchema.parse(plan).canvasLayout?.tables.t?.shape, undefined);
  assert.equal(
    seatingPlanSchema.parse({
      ...plan,
      canvasLayout: { ...plan.canvasLayout, tables: { t: { x: 10, y: 20, shape: null } } },
    }).canvasLayout?.tables.t?.shape,
    null,
  );
  for (const shape of ["round", "twoSided", "fourSided"]) {
    const input = {
      ...plan,
      canvasLayout: { ...plan.canvasLayout, tables: { t: { x: 10, y: 20, shape } } },
    };
    assert.equal(seatingPlanSchema.parse(input).canvasLayout?.tables.t?.shape, shape);
  }
  assert.equal(
    seatingPlanSchema.safeParse({
      ...plan,
      canvasLayout: { ...plan.canvasLayout, tables: { t: { x: 10, y: 20, shape: "invalid" } } },
    }).success,
    false,
  );
});
