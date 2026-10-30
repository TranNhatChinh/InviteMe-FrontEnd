import type { CoupleRow } from "./couple-import";

export type SeatingParty = {
  id: string;
  name: string;
  address: string;
  kind: string;
  count: number;
  group: string;
  note: string;
  phone?: string;
  side?: string;
};
// Entries represent reserved places, never fabricated attendee records.
export type SeatingPlan = Record<string, (number | null)[]>;
export type SeatingStrategy = "affinity" | "party" | "compact";

export const seatingStrategies: {
  id: SeatingStrategy;
  label: string;
  description: string;
  source: string;
}[] = [
  {
    id: "affinity",
    label: "Theo nhóm quen biết",
    description:
      "Ưu tiên cùng nhóm khách và cùng phía ngồi chung bàn. Giữ nguyên từng nhóm đi cùng nếu vừa bàn; không tự ghép nhà gái với nhà trai để lấp chỗ trống.",
    source: "Dựa trên: Phía khách mời + Nhóm khách + Tổng người dự kiến.",
  },
  {
    id: "party",
    label: "Theo nhóm đi cùng",
    description:
      "Giữ các chỗ của mỗi người đại diện và người đi cùng ở chung một bàn. Xếp lần lượt theo danh sách, không ưu tiên các nhóm quen biết.",
    source: "Dựa trên: từng dòng nhận thiệp + Tổng người dự kiến.",
  },
  {
    id: "compact",
    label: "Ưu tiên đầy bàn",
    description:
      "Xếp nhóm đông trước, ưu tiên bàn còn ít chỗ trống vừa đủ. Có thể ghép các nhóm khách khác nhau; giữ nguyên nhóm đi cùng nếu vừa bàn.",
    source: "Dựa trên: Tổng người dự kiến + sức chứa bàn. Không bảo đảm số bàn ít nhất tuyệt đối.",
  },
];

export function recipientLabel(party: Pick<SeatingParty, "name" | "address" | "kind">) {
  const address = party.address ? `${party.address.toLocaleLowerCase("vi")} ` : "";
  if (party.kind === "Gia đình") return `Gia đình ${address}${party.name}`;
  if (party.kind === "Nhóm") return /^nhóm\s/i.test(party.name) ? party.name : `Nhóm ${party.name}`;
  const label = `${address}${party.name}`;
  return label.charAt(0).toLocaleUpperCase("vi") + label.slice(1);
}

export function seatingParties(rows: CoupleRow[]): SeatingParty[] {
  return rows
    .filter((row) => !row.errors.length && row.expected !== null)
    .map((row) => ({
      id: String(row.line),
      name: row.values[0] ?? "",
      address: row.values[1] ?? "",
      kind: row.values[2] ?? "Cá nhân",
      count: row.expected ?? 1,
      group: row.values[5] || "Chưa phân nhóm",
      note: row.values[7] ?? "",
      phone: row.values[6] ?? "",
      side: row.values[4] || "Chưa xác định",
    }));
}

export function groupKey(group: string) {
  return group.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

export const affinityGroupKey = (party: SeatingParty) =>
  `${party.side ?? ""}::${groupKey(party.group)}`;
export function recommendedTableCount(parties: SeatingParty[], capacity: number) {
  const sides = new Map<string, number>();
  for (const party of parties)
    sides.set(party.side ?? "", (sides.get(party.side ?? "") ?? 0) + party.count);
  return Math.min(
    30,
    Math.max(
      1,
      [...sides.values()].reduce((sum, count) => sum + Math.ceil(count / capacity), 0),
    ),
  );
}

export function suggestSeating(
  parties: SeatingParty[],
  capacity: number,
  tableCount: number,
  strategy: SeatingStrategy = "affinity",
): SeatingPlan {
  const plan: SeatingPlan = {};
  const occupancy = Array.from({ length: tableCount }, () => 0);
  const groups = Array.from({ length: tableCount }, () => new Set<string>());
  const tableSides: (string | null)[] = Array.from({ length: tableCount }, () => null);
  const groupSizes = new Map<string, number>();
  for (const party of parties)
    groupSizes.set(
      affinityGroupKey(party),
      (groupSizes.get(affinityGroupKey(party)) ?? 0) + party.count,
    );
  const ordered =
    strategy === "party"
      ? [...parties]
      : strategy === "compact"
        ? [...parties].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
        : [...parties].sort(
            (a, b) =>
              (groupSizes.get(affinityGroupKey(b)) ?? 0) -
                (groupSizes.get(affinityGroupKey(a)) ?? 0) ||
              groupKey(a.group).localeCompare(groupKey(b.group), "vi") ||
              b.count - a.count ||
              a.id.localeCompare(b.id),
          );
  for (const party of ordered) {
    const key = affinityGroupKey(party);
    const side = party.side ?? "";
    const compatible = (index: number) => tableSides[index] === null || tableSides[index] === side;
    const knownGroup = groupKey(party.group) !== "chưa phân nhóm";
    const groupTotal = groupSizes.get(key) ?? party.count;
    const wholeGroupTable =
      strategy === "affinity" &&
      knownGroup &&
      groupTotal <= capacity &&
      !groups.some((items) => items.has(key))
        ? occupancy
            .map((used, index) => ({ used, index }))
            .filter(({ used, index }) => used + groupTotal <= capacity && compatible(index))
            .sort((a, b) => b.used - a.used || a.index - b.index)[0]?.index
        : undefined;
    const candidates = occupancy
      .map((used, index) => ({ index, used }))
      .filter(({ used, index }) => used + party.count <= capacity && compatible(index));
    candidates.sort(
      (a, b) =>
        Number(b.index === wholeGroupTable) - Number(a.index === wholeGroupTable) ||
        Number(strategy === "affinity" && groups[b.index]?.has(key) && knownGroup) -
          Number(strategy === "affinity" && groups[a.index]?.has(key) && knownGroup) ||
        (strategy === "party" ? a.index - b.index : b.used - a.used) ||
        a.index - b.index,
    );
    const table = candidates[0]?.index;
    plan[party.id] = Array.from({ length: party.count }, () => table ?? null);
    if (table !== undefined) {
      occupancy[table] = (occupancy[table] ?? 0) + party.count;
      groups[table]?.add(key);
      tableSides[table] = side;
    }
  }
  return plan;
}

export function tableOccupancy(plan: SeatingPlan, table: number) {
  return Object.values(plan).reduce(
    (sum, places) => sum + places.filter((value) => value === table).length,
    0,
  );
}

export function movePlaces(
  plan: SeatingPlan,
  partyId: string,
  target: number | null,
  capacity: number,
  tableCount: number,
  place?: number,
): SeatingPlan | null {
  const current = plan[partyId];
  if (
    !Array.isArray(current) ||
    (target !== null && (!Number.isInteger(target) || target < 0 || target >= tableCount))
  )
    return null;
  if (place !== undefined && (place < 0 || place >= current.length)) return null;
  const next = current.map((table, index) =>
    place === undefined || index === place ? target : table,
  );
  if (target !== null) {
    const usedByOthers =
      tableOccupancy(plan, target) - current.filter((table) => table === target).length;
    if (usedByOthers + next.filter((table) => table === target).length > capacity) return null;
  }
  return { ...plan, [partyId]: next };
}
