export type StoryMergeConflict = {
  path: string[];
  localExists: boolean;
  localValue?: unknown;
  remoteExists: boolean;
  remoteValue?: unknown;
};

export type StoryMergeResult<T> = { document: T; conflicts: StoryMergeConflict[] };
export type StoryHistoryOperation<T> = { before: T; after: T };
export type StoryHistoryResult<T> = { document: T; skippedChanges: number };

const MISSING = Symbol("missing");
type MaybeValue = unknown | typeof MISSING;
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const equal = (left: MaybeValue, right: MaybeValue) =>
  left === MISSING || right === MISSING
    ? left === right
    : JSON.stringify(left) === JSON.stringify(right);
const copy = <T>(value: T): T => structuredClone(value);
const hasStableIds = (items: unknown[]): items is Array<Record<string, unknown> & { id: string }> =>
  items.every((item) => isObject(item) && typeof item.id === "string" && item.id.length > 0) &&
  new Set(items.map((item) => (item as { id: string }).id)).size === items.length;

function mergeArray(base: unknown[], local: unknown[], remote: unknown[], path: string[], conflicts: StoryMergeConflict[]): MaybeValue {
  if (!hasStableIds(base) || !hasStableIds(local) || !hasStableIds(remote)) {
    conflicts.push({ path, localExists: true, localValue: copy(local), remoteExists: true, remoteValue: copy(remote) });
    return copy(local);
  }

  const baseById = new Map(base.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const ids = [...new Set([...base.map((item) => item.id), ...local.map((item) => item.id), ...remote.map((item) => item.id)])];
  const mergedById = new Map<string, unknown>();
  for (const id of ids) {
    const merged = mergeValue(baseById.get(id) ?? MISSING, localById.get(id) ?? MISSING,
      remoteById.get(id) ?? MISSING, [...path, `@${id}`], conflicts);
    if (merged !== MISSING) mergedById.set(id, merged);
  }

  const baseIds = base.map((item) => item.id);
  const localIds = local.map((item) => item.id).filter((id) => baseById.has(id));
  const remoteIds = remote.map((item) => item.id).filter((id) => baseById.has(id));
  const baseCommon = baseIds.filter((id) => localById.has(id) && remoteById.has(id));
  const localCommon = localIds.filter((id) => remoteById.has(id));
  const remoteCommon = remoteIds.filter((id) => localById.has(id));
  const localReordered = !sameOrder(localCommon, baseCommon);
  const remoteReordered = !sameOrder(remoteCommon, baseCommon);
  const orderConflict = localReordered && remoteReordered && !sameOrder(localCommon, remoteCommon);
  if (orderConflict) {
    conflicts.push({ path: [...path, "$order"], localExists: true, localValue: local.map((item) => item.id),
      remoteExists: true, remoteValue: remote.map((item) => item.id) });
  }

  const useLocalOrder = orderConflict || localReordered;
  const preferredOrder = useLocalOrder ? local.map((item) => item.id) : remote.map((item) => item.id);
  const secondaryOrder = useLocalOrder ? remote.map((item) => item.id) : local.map((item) => item.id);
  const orderedIds = [...new Set([...preferredOrder, ...secondaryOrder, ...ids])].filter((id) => mergedById.has(id));
  return orderedIds.map((id) => mergedById.get(id));
}

function sameOrder(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function mergeValue(base: MaybeValue, local: MaybeValue, remote: MaybeValue, path: string[], conflicts: StoryMergeConflict[]): MaybeValue {
  if (equal(local, base)) return remote === MISSING ? MISSING : copy(remote);
  if (equal(remote, base)) return local === MISSING ? MISSING : copy(local);
  if (equal(local, remote)) return local === MISSING ? MISSING : copy(local);

  if ((base === MISSING && isObject(local) && isObject(remote)) ||
    (isObject(base) && isObject(local) && isObject(remote))) {
    const output: Record<string, unknown> = {};
    const baseObject = isObject(base) ? base : {};
    const localObject = isObject(local) ? local : {};
    const remoteObject = isObject(remote) ? remote : {};
    for (const key of new Set([...Object.keys(baseObject), ...Object.keys(localObject), ...Object.keys(remoteObject)])) {
      const merged = mergeValue(key in baseObject ? baseObject[key] : MISSING,
        key in localObject ? localObject[key] : MISSING, key in remoteObject ? remoteObject[key] : MISSING,
        [...path, key], conflicts);
      if (merged !== MISSING) output[key] = merged;
    }
    return output;
  }

  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote))
    return mergeArray(base, local, remote, path, conflicts);

  conflicts.push({ path, localExists: local !== MISSING, ...(local === MISSING ? {} : { localValue: copy(local) }),
    remoteExists: remote !== MISSING, ...(remote === MISSING ? {} : { remoteValue: copy(remote) }) });
  return local === MISSING ? MISSING : copy(local);
}

export function mergeStoryDocuments<T>(base: T, local: T, remote: T): StoryMergeResult<T> {
  const conflicts: StoryMergeConflict[] = [];
  const document = mergeValue(base, local, remote, [], conflicts);
  return { document: (document === MISSING ? copy(local) : document) as T, conflicts };
}

export function resolveStoryMergeConflict<T>(document: T, conflict: StoryMergeConflict, side: "local" | "remote"): T {
  const exists = side === "local" ? conflict.localExists : conflict.remoteExists;
  const value = side === "local" ? conflict.localValue : conflict.remoteValue;
  const next = copy(document) as unknown;
  const segments = conflict.path;
  if (segments.at(-1) === "$order") {
    const arrayPath = segments.slice(0, -1);
    const array = getAtPath(next, arrayPath);
    if (!Array.isArray(array) || !Array.isArray(value)) return next as T;
    const byId = new Map(array.filter(isObject).filter((item) => typeof item.id === "string").map((item) => [item.id as string, item]));
    const ids = value.filter((id): id is string => typeof id === "string");
    const ordered = ids.flatMap((id) => byId.has(id) ? [byId.get(id)] : []);
    for (const item of array) if (isObject(item) && typeof item.id === "string" && !ids.includes(item.id)) ordered.push(item);
    setAtPath(next, arrayPath, ordered);
    return next as T;
  }
  setAtPath(next, segments, exists ? copy(value) : MISSING);
  return next as T;
}

function getAtPath(root: unknown, path: string[]): unknown {
  let current = root;
  for (const segment of path) {
    if (segment.startsWith("@")) {
      if (!Array.isArray(current)) return undefined;
      current = current.find((item) => isObject(item) && item.id === segment.slice(1));
    } else {
      if (!isObject(current)) return undefined;
      current = current[segment];
    }
  }
  return current;
}

function setAtPath(root: unknown, path: string[], value: MaybeValue): void {
  if (path.length === 0) return;
  const [segment, ...rest] = path;
  if (!segment) return;
  if (segment.startsWith("@")) {
    if (!Array.isArray(root)) return;
    const id = segment.slice(1);
    const index = root.findIndex((item) => isObject(item) && item.id === id);
    if (rest.length === 0) {
      if (value === MISSING) { if (index >= 0) root.splice(index, 1); }
      else if (index >= 0) root[index] = value;
      else root.push(value);
      return;
    }
    if (index >= 0) setAtPath(root[index], rest, value);
    return;
  }
  if (!isObject(root)) return;
  const record = root as Record<string, unknown>;
  if (rest.length === 0) {
    if (value === MISSING) delete record[segment];
    else record[segment] = value;
    return;
  }
  setAtPath(record[segment], rest, value);
}

export function applyStoryHistoryOperation<T>(document: T, operation: StoryHistoryOperation<T>, direction: "undo" | "redo"): StoryHistoryResult<T> {
  let skippedChanges = 0;
  const expected = direction === "undo" ? operation.after : operation.before;
  const desired = direction === "undo" ? operation.before : operation.after;
  const result = applyHistoryValue(copy(document), expected, desired);
  skippedChanges += result.skipped;
  return { document: result.value as T, skippedChanges };
}

function applyHistoryValue(current: unknown, expected: unknown, desired: unknown): { value: unknown; skipped: number } {
  if (equal(expected, desired)) return { value: current, skipped: 0 };
  if (isObject(expected) && isObject(desired) && isObject(current)) {
    const result = { ...current };
    let skipped = 0;
    for (const key of new Set([...Object.keys(expected), ...Object.keys(desired)])) {
      const hasExpected = key in expected;
      const hasDesired = key in desired;
      if (hasExpected === hasDesired && (!hasExpected || equal(expected[key], desired[key]))) continue;
      if (hasExpected && hasDesired && isObject(expected[key]) && isObject(desired[key]) && isObject(current[key])) {
        const nested = applyHistoryValue(current[key], expected[key], desired[key]);
        result[key] = nested.value; skipped += nested.skipped; continue;
      }
      if (hasExpected && hasDesired && Array.isArray(expected[key]) && Array.isArray(desired[key]) && Array.isArray(current[key]) &&
        hasStableIds(expected[key]) && hasStableIds(desired[key]) && hasStableIds(current[key])) {
        const nested = applyHistoryArray(current[key], expected[key], desired[key]);
        result[key] = nested.value; skipped += nested.skipped; continue;
      }
      if (!hasExpected || !hasDesired) {
        if (hasExpected && !hasDesired && isObject(expected[key]) && isObject(current[key]) && !equal(current[key], expected[key])) { skipped++; continue; }
        if (hasExpected && !hasDesired && Array.isArray(expected[key]) && Array.isArray(current[key]) && !equal(current[key], expected[key])) { skipped++; continue; }
        if (!hasExpected && hasDesired && key in current) { skipped++; continue; }
        if (hasDesired) result[key] = copy(desired[key]);
        else delete result[key];
        continue;
      }
      if (equal(current[key], expected[key])) result[key] = copy(desired[key]);
      else skipped++;
    }
    return { value: result, skipped };
  }
  if (Array.isArray(expected) && Array.isArray(desired) && Array.isArray(current) &&
    hasStableIds(expected) && hasStableIds(desired) && hasStableIds(current))
    return applyHistoryArray(current, expected, desired);
  if (equal(current, expected)) return { value: desired === undefined ? undefined : copy(desired), skipped: 0 };
  return { value: current, skipped: 1 };
}

function applyHistoryArray(current: Array<Record<string, unknown> & { id: string }>,
  expected: Array<Record<string, unknown> & { id: string }>,
  desired: Array<Record<string, unknown> & { id: string }>): { value: unknown[]; skipped: number } {
  const currentById = new Map(current.map((item) => [item.id, copy(item)]));
  const expectedById = new Map(expected.map((item) => [item.id, item]));
  const desiredById = new Map(desired.map((item) => [item.id, item]));
  let skipped = 0;
  for (const id of new Set([...expectedById.keys(), ...desiredById.keys()])) {
    const before = expectedById.get(id);
    const after = desiredById.get(id);
    const present = currentById.get(id);
    if (before && after && present) {
      const nested = applyHistoryValue(present, before, after);
      currentById.set(id, nested.value as Record<string, unknown> & { id: string });
      skipped += nested.skipped;
    } else if (before && !after) {
      if (present && equal(present, before)) currentById.delete(id);
      else if (present) skipped++;
    } else if (!before && after) {
      if (!present) currentById.set(id, copy(after));
      else skipped++;
    }
  }
  const expectedOrder = expected.map((item) => item.id).filter(id => desiredById.has(id));
  const desiredOrder = desired.map((item) => item.id).filter(id => expectedById.has(id));
  const orderChanged = !sameOrder(expectedOrder, desiredOrder);
  let orderedIds: string[];
  if (orderChanged) {
    const currentExpectedOrder = current.map((item) => item.id).filter(id => expectedById.has(id) && desiredById.has(id));
    const comparableExpected = expectedOrder.filter(id => currentById.has(id));
    if (sameOrder(currentExpectedOrder, comparableExpected))
      orderedIds = [...desired.map(item => item.id), ...current.map(item => item.id)];
    else { orderedIds = current.map(item => item.id); skipped++; }
  } else orderedIds = current.map(item => item.id);
  const seen = new Set<string>();
  const uniqueOrder = orderedIds.filter(id => currentById.has(id) && !seen.has(id) && Boolean(seen.add(id)));
  for (const id of currentById.keys()) if (!seen.has(id)) uniqueOrder.push(id);
  return {
    value: uniqueOrder.flatMap(id => {
      const item = currentById.get(id);
      return item === undefined ? [] : [item];
    }),
    skipped,
  };
}
