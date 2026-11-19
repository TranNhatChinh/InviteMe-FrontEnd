import assert from "node:assert/strict";
import test from "node:test";
import { resolveParticles } from "../src/features/template-studio/components/particle-settings";

test("invitation particles work without a cover", () => {
  assert.equal(resolveParticles({ particles: "leaves" }), "leaves");
  assert.equal(resolveParticles({ particles: "hearts", cover: { enabled: false } }), "hearts");
});

test("legacy cover particle choices are retained", () => {
  assert.equal(resolveParticles({ cover: { enabled: true, particles: "happiness" } }), "happiness");
  assert.equal(resolveParticles({ cover: { enabled: true } }), "hearts");
  assert.equal(resolveParticles({ cover: { enabled: false, particles: "leaves" } }), "leaves");
});

test("turning particles off overrides the legacy cover setting", () => {
  assert.equal(
    resolveParticles({ particles: "none", cover: { enabled: true, particles: "hearts" } }),
    "none",
  );
  assert.equal(resolveParticles(), "none");
});
