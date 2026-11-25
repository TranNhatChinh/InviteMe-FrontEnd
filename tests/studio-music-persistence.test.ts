import test from "node:test";
import assert from "node:assert/strict";
import { parseStudioDocument } from "../src/features/template-studio/schemas/document";
import {
  resolveInvitationDocument,
  storedInvitationDocument,
} from "../src/features/template-studio/api/design.api";
import { publicTemplateSchema } from "../src/features/public/api/templates.api";
import { importedDocument } from "../src/features/template-studio/imported/document";
import brown from "../src/features/template-studio/templates/minimalism-brown.json";

const music = {
  trackId: "41084180-9601-4380-808b-aa3973d52046",
  enabled: true,
  volume: 0.65,
  loop: true,
};

for (const kind of ["standard", "imported"] as const) {
  test(`${kind} invitation keeps chosen music across storage and reopening`, () => {
    const document =
      kind === "standard"
        ? parseStudioDocument(JSON.stringify(brown))
        : importedDocument([
            { id: "page1", imageUrl: "/media/page.png", width: 600, height: 900, order: 0 },
          ]);
    document.nodes.ROOT!.props.music = music;
    const stored = JSON.stringify(storedInvitationDocument(document));
    const reopened = resolveInvitationDocument(parseStudioDocument(stored));
    assert.deepEqual(reopened.nodes.ROOT!.props.music, music);
    assert.equal("audioUrl" in reopened.nodes.ROOT!.props.music!, false);
    reopened.nodes.ROOT!.props.music!.enabled = false;
    assert.equal(
      parseStudioDocument(JSON.stringify(storedInvitationDocument(reopened))).nodes.ROOT!.props
        .music!.enabled,
      false,
    );
  });
}

test("public template schema preserves resolved audio needed for anonymous preview", () => {
  const resolved = {
    ...music,
    name: "Wedding piano",
    audioUrl: "https://api.example.com/media/music/piano.mp3",
    isActive: true,
  };
  const template = publicTemplateSchema.parse({
    id: "a365619a-f30b-49e6-b8f5-daf046e9bb67",
    name: "Wedding",
    slug: "wedding",
    theme: "BOTANICAL",
    previewUrl: "/images/template.webp",
    configurationJson: JSON.stringify(brown),
    music: resolved,
  });
  assert.deepEqual(template.music, resolved);
});
