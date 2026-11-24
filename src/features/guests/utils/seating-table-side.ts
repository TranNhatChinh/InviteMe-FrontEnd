export function tableSideColors(side: string | null | undefined) {
  if (side === "GROOM")
    return { surface: "bg-[#b9ddf5]", card: "border-sky-300 bg-sky-50/60", label: "GROOM" };
  if (side === "BRIDE")
    return { surface: "bg-[#ffc4d2]", card: "border-pink-300 bg-pink-50/60", label: "BRIDE" };
  return { surface: "bg-stone-200", card: "border-stone-300 bg-white/60", label: "neutralSide" };
}
