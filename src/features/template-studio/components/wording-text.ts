export const defaultWordingText = "Trân trọng mời Quý khách đến chung vui trong ngày cưới.";

/** Cover greetings use the recipient independently of configurable body wording. */
export function resolveCoverGreeting(recipientLabel: string | null = null) {
  return `Trân trọng kính mời ${recipientLabel?.trim() || "Quý khách"}`;
}

/** Bind the block at render time; the document never stores the selected guest's identity. */
export function resolveStudioText(
  props: { text?: string; textBinding?: "invitationWording" },
  previewContent: string | null = null,
) {
  return props.textBinding === "invitationWording"
    ? (previewContent ?? defaultWordingText)
    : (props.text ?? "Viết lời của bạn");
}
