import assert from "node:assert/strict";
import test from "node:test";
import { countSmsSegments } from "../src/features/invitations/utils/sms-segments";

test("SMS segment counting uses GSM-7 basic and extension table capacities", () => {
  assert.deepEqual(countSmsSegments("a".repeat(160)), {
    encoding: "GSM-7",
    units: 160,
    segments: 1,
    unitsPerSegment: 160,
  });
  assert.equal(countSmsSegments("a".repeat(161)).segments, 2);
  assert.equal(countSmsSegments("^".repeat(80)).segments, 1);
  assert.equal(countSmsSegments("^".repeat(81)).segments, 2);
});

test("Vietnamese and surrogate pairs are counted as UCS-2 UTF-16 units", () => {
  assert.deepEqual(countSmsSegments("ế".repeat(70)), {
    encoding: "UCS-2",
    units: 70,
    segments: 1,
    unitsPerSegment: 70,
  });
  assert.equal(countSmsSegments("ế".repeat(71)).segments, 2);
  assert.equal(countSmsSegments("😀".repeat(35)).segments, 1);
  assert.equal(countSmsSegments("😀".repeat(36)).segments, 2);
});
