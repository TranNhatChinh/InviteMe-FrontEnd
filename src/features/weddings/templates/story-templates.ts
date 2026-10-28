import type { PublicStoryTemplate } from "../api/website.api";

export const storyTemplates = {
  romantic: {
    key: "romantic", name: "Romantic", description: "Hoa nhẹ, chân dung xen kẽ và đồng hồ cổ điển.",
    palette: ["blush", "dusty-blue"] as const,
    allowedFonts: ["Georgia", "Playfair Display", "Nunito", "Lora"] as const,
    sections: ["hero", "countdown", "couple", "loveStory", "events", "gallery", "rsvp", "wishes", "gift"] as const,
    variants: { hero: "floral", countdown: "classic", couple: "alternating", loveStory: "timeline", events: "cards", gallery: "grid" },
  },
  royal: {
    key: "royal", name: "Royal", description: "Nền tối sang trọng, chân dung hai cột và đồng hồ dạng banner.",
    palette: ["burgundy", "navy"] as const,
    allowedFonts: ["Georgia", "Cormorant Garamond", "Montserrat", "Lora"] as const,
    sections: ["hero", "couple", "countdown", "loveStory", "events", "gallery", "rsvp", "wishes", "gift"] as const,
    variants: { hero: "dark", countdown: "banner", couple: "two-columns", loveStory: "editorial", events: "cards", gallery: "grid" },
  },
} as const;

export type StoryTemplateKey = keyof typeof storyTemplates;

export const storyPalettes = {
  blush: { label: "Hồng phấn", background: "#fffaf5", text: "#3a2a2c", accent: "#805459", primary: "#f4dadc" },
  "dusty-blue": { label: "Xanh bụi", background: "#ffffff", text: "#22313d", accent: "#3f6a8a", primary: "#d6e2ec" },
  burgundy: { label: "Đỏ rượu", background: "#1b1416", text: "#f5ede0", accent: "#c9a24b", primary: "#7a1e2c" },
  navy: { label: "Xanh navy", background: "#10151d", text: "#f1eee6", accent: "#c9a24b", primary: "#1f3a5f" },
} as const;

export type StoryPaletteKey = keyof typeof storyPalettes;

export const builtinStoryTemplateCatalog: PublicStoryTemplate[] =
  (Object.keys(storyTemplates) as StoryTemplateKey[]).map((key) => {
    const template = storyTemplates[key];
    const paletteIds: readonly StoryPaletteKey[] = template.palette;
    const defaultColors = storyPalettes[paletteIds[0] ?? "blush"];
    return {
      key, name: template.name, version: 1,
      config: {
        key, name: template.name,
        sections: template.sections.map((type) => ({ type, variant: (template.variants as Record<string, string>)[type] ?? "default" })),
        theme: { colors: defaultColors, fontHeading: "Georgia", fontBody: "Georgia" },
        palettes: paletteIds.map((id) => ({ id, label: storyPalettes[id].label, colors: storyPalettes[id] })),
        allowedFonts: [...template.allowedFonts],
      },
    };
  });

export function hiddenSections(from: StoryTemplateKey, to: StoryTemplateKey) {
  const next = new Set<string>(storyTemplates[to].sections);
  return storyTemplates[from].sections.filter((section) => !next.has(section));
}

