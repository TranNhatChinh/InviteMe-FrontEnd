import { WeddingStoryEditor, starterWeddingStory } from "@/features/weddings";

export default function WeddingStoryEditorPreviewPage() {
  return (
    <WeddingStoryEditor
      demo
      weddingId="preview"
      site={{
        version: 0,
        document: starterWeddingStory,
        status: "DRAFT",
        hasUnpublishedChanges: false,
        warnings: [],
      }}
    />
  );
}
