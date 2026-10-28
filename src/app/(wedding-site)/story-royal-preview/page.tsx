import { StoryClassic, starterWeddingStory } from "@/features/weddings";

export default function StoryRoyalPreviewPage() {
  return <StoryClassic document={{ ...starterWeddingStory, templateId: "royal", paletteId: "burgundy" }} />;
}
