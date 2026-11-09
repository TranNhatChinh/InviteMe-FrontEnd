import test from "node:test";
import assert from "node:assert/strict";
import { itemStyle } from "../src/features/template-studio/components/items";

test("read-only invitation items allow browser scrolling while editor items retain drag control", () => {
  const fullHero = { x: 0, y: 0, width: 480, height: 690, opacity: 0.1 };
  assert.equal(itemStyle(fullHero, false, false).touchAction, "auto");
  assert.equal(itemStyle(fullHero, false).touchAction, "auto");
  assert.equal(itemStyle(fullHero, true, true).touchAction, "none");
  assert.equal(itemStyle(fullHero, false, true).touchAction, "none");
  assert.equal(itemStyle(fullHero, false, false).position, "absolute");
  assert.equal(itemStyle(fullHero, false, false).width, 480);
});
