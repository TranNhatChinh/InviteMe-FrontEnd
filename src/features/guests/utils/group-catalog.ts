import { groupLabels } from "@/shared/lib/planning-groups";

export const defaultGroups = Object.values(groupLabels);
export const normalizeGroup = (label: string) =>
  label.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
export const findGroup = (label: string, catalog: readonly string[]) =>
  catalog.find((item) => normalizeGroup(item) === normalizeGroup(label));
