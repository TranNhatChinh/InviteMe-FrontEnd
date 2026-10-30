const GSM_BASIC = new Set(Array.from("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"));
const GSM_EXTENSION = new Set(Array.from("\f^{}\\[~]|€"));

export function countSmsSegments(content: string) {
  if (!content) return { encoding: "GSM-7", units: 0, segments: 0, unitsPerSegment: 160 };
  let gsmUnits = 0;
  for (const character of content) {
    if (GSM_BASIC.has(character)) gsmUnits += 1;
    else if (GSM_EXTENSION.has(character)) gsmUnits += 2;
    else {
      const units = content.length; // UTF-16 units, as used by Unicode SMS encoding.
      return { encoding: "Unicode", units, segments: units <= 70 ? 1 : Math.ceil(units / 67), unitsPerSegment: units <= 70 ? 70 : 67 };
    }
  }
  return { encoding: "GSM-7", units: gsmUnits, segments: gsmUnits <= 160 ? 1 : Math.ceil(gsmUnits / 153), unitsPerSegment: gsmUnits <= 160 ? 160 : 153 };
}
