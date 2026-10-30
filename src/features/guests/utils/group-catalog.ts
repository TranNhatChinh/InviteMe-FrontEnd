import type { CoupleRow } from "./couple-import";

export const defaultGroups = [
  "Họ nội",
  "Họ ngoại",
  "Bạn cấp 3",
  "Bạn đại học",
  "Đồng nghiệp",
  "Đối tác",
  "Thầy cô",
  "Bạn chung",
  "CLB cầu lông",
];
export const normalizeGroup = (label: string) =>
  label.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
export const findGroup = (label: string, catalog: readonly string[]) =>
  catalog.find((item) => normalizeGroup(item) === normalizeGroup(label));
export const groupReviewKey = (side: string, label: string) =>
  `${normalizeGroup(side)}::${normalizeGroup(label)}`;

export function unknownGroups(rows: CoupleRow[], catalog: readonly string[]) {
  const unknown = new Map<string, { key: string; label: string; side: string; lines: number[] }>();
  for (const row of rows) {
    const label = row.values[5] ?? "",
      side = row.values[4] ?? "";
    if (!label || findGroup(label, catalog)) continue;
    const key = groupReviewKey(side, label);
    const entry = unknown.get(key) ?? { key, label, side, lines: [] };
    entry.lines.push(row.line);
    unknown.set(key, entry);
  }
  return [...unknown.values()];
}

export function resolveGroupRows(
  rows: CoupleRow[],
  key: string,
  target: string,
  catalog: readonly string[],
) {
  const label = findGroup(target, catalog);
  if (!label) throw new Error("Chọn nhóm trong danh mục hoặc xác nhận tạo nhóm mới.");
  return rows.map((row) => {
    if (groupReviewKey(row.values[4] ?? "", row.values[5] ?? "") !== key) return row;
    const values = [...row.values];
    values[5] = label;
    return { ...row, values };
  });
}

export function addGroup(catalog: readonly string[], input: string) {
  const label = input.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!label || label.length > 100 || /^[=+@-]/.test(label))
    throw new Error("Tên nhóm cần từ 1–100 ký tự và không bắt đầu bằng ký hiệu công thức.");
  const existing = findGroup(label, catalog);
  return { label: existing ?? label, catalog: existing ? [...catalog] : [...catalog, label] };
}

export function groupSuggestions(label: string, catalog: readonly string[]) {
  const source = normalizeGroup(label);
  function distance(target: string) {
    let previous = Array.from({ length: target.length + 1 }, (_, i) => i);
    for (let i = 0; i < source.length; i++) {
      const current = [i + 1];
      for (let j = 0; j < target.length; j++)
        current[j + 1] = Math.min(
          (current[j] ?? 0) + 1,
          (previous[j + 1] ?? 0) + 1,
          (previous[j] ?? 0) + (source[i] === target[j] ? 0 : 1),
        );
      previous = current;
    }
    return previous[target.length] ?? Infinity;
  }
  return catalog
    .map((item) => ({ label: item, distance: distance(normalizeGroup(item)) }))
    .filter((item) => item.distance <= 3)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((item) => item.label);
}
