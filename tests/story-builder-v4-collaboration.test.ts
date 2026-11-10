import assert from "node:assert/strict";
import test from "node:test";
import { applyStoryHistoryOperation, mergeStoryDocuments, resolveStoryMergeConflict } from "../src/features/weddings/schemas/story-builder-v4-collaboration";

const base = {
  pages: [{ id: "home", title: "Home", sections: [
    { id: "hero", content: { title: "Welcome", subtitle: "Save the date" } },
    { id: "gallery", content: { images: [{ id: "photo-1", imageUrl: "/one.jpg" }] } },
  ] }],
};

test("three-way merge preserves simultaneous edits to different fields and stable sections", () => {
  const local = structuredClone(base);
  local.pages[0]!.sections[0]!.content.title = "Our wedding";
  const remote = structuredClone(base);
  remote.pages[0]!.sections[0]!.content.subtitle = "Join our day";
  remote.pages[0]!.sections[1]!.content.images!.push({ id: "photo-2", imageUrl: "/two.jpg" });

  const result = mergeStoryDocuments(base, local, remote);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.document.pages[0]!.sections[0]!.content.title, "Our wedding");
  assert.equal(result.document.pages[0]!.sections[0]!.content.subtitle, "Join our day");
  assert.deepEqual(result.document.pages[0]!.sections[1]!.content.images!.map((image) => image.id), ["photo-1", "photo-2"]);
});

test("same-field concurrent edits are surfaced and can be resolved to remote", () => {
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.pages[0]!.sections[0]!.content.title = "Our wedding";
  remote.pages[0]!.sections[0]!.content.title = "Minh & Lan";
  const result = mergeStoryDocuments(base, local, remote);

  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.conflicts[0]!.path, ["pages", "@home", "sections", "@hero", "content", "title"]);
  const resolved = resolveStoryMergeConflict(result.document, result.conflicts[0]!, "remote");
  assert.equal(resolved.pages[0]!.sections[0]!.content.title, "Minh & Lan");
});

test("deleting a section while the other session edits it is a structural conflict", () => {
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.pages[0]!.sections.splice(1, 1);
  remote.pages[0]!.sections[1]!.content.images![0]!.imageUrl = "/updated.jpg";
  const result = mergeStoryDocuments(base, local, remote);

  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.conflicts[0]!.path, ["pages", "@home", "sections", "@gallery"]);
  const resolved = resolveStoryMergeConflict(result.document, result.conflicts[0]!, "remote");
  assert.equal(resolved.pages[0]!.sections[1]!.content.images![0]!.imageUrl, "/updated.jpg");
});

test("simultaneous section reorder is reported while independent reorder applies", () => {
  const orderBase = { sections: [{ id: "a" }, { id: "b" }, { id: "c" }] };
  const local = { sections: [{ id: "b" }, { id: "a" }, { id: "c" }] };
  const remote = { sections: [{ id: "a" }, { id: "c" }, { id: "b" }] };
  const both = mergeStoryDocuments(orderBase, local, remote);
  assert.ok(both.conflicts.some((conflict) => conflict.path.at(-1) === "$order"));
  const remoteOnly = mergeStoryDocuments(orderBase, orderBase, remote);
  assert.deepEqual(remoteOnly.document.sections.map((item) => item.id), ["a", "c", "b"]);
});

test("undo reverses the local field change without erasing another session's independent edit", () => {
  const before = structuredClone(base);
  const after = structuredClone(base);
  after.pages[0]!.sections[0]!.content.title = "Our wedding";
  const current = structuredClone(after);
  current.pages[0]!.sections[0]!.content.subtitle = "Please join us";
  const result = applyStoryHistoryOperation(current, { before, after }, "undo");
  assert.equal(result.document.pages[0]!.sections[0]!.content.title, "Welcome");
  assert.equal(result.document.pages[0]!.sections[0]!.content.subtitle, "Please join us");
  assert.equal(result.skippedChanges, 0);
});

test("undo does not overwrite a later remote change to the same field", () => {
  const before = structuredClone(base);
  const after = structuredClone(base);
  after.pages[0]!.sections[0]!.content.title = "Our wedding";
  const current = structuredClone(after);
  current.pages[0]!.sections[0]!.content.title = "Minh & Lan";
  const result = applyStoryHistoryOperation(current, { before, after }, "undo");
  assert.equal(result.document.pages[0]!.sections[0]!.content.title, "Minh & Lan");
  assert.equal(result.skippedChanges, 1);
});

test("undoing a section addition keeps a section added by another session", () => {
  const before = { pages: [{ id: "home", sections: [{ id: "hero", content: { title: "Hi" } }] }] };
  const after = structuredClone(before);
  after.pages[0]!.sections.push({ id: "story-local", content: { title: "Local" } });
  const current = structuredClone(after);
  current.pages[0]!.sections.push({ id: "gallery-remote", content: { title: "Remote" } });
  const result = applyStoryHistoryOperation(current, { before, after }, "undo");
  assert.deepEqual(result.document.pages[0]!.sections.map(section => section.id), ["hero", "gallery-remote"]);
});
