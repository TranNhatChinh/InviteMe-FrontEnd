import { StoryClassic, starterWeddingStory } from "@/features/weddings";

export default function StoryRomanticPreviewPage() {
  return <StoryClassic document={{ ...starterWeddingStory, templateId: "romantic", paletteId: "blush" }} />;
}
