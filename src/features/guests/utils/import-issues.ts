export type RowIssue = { rowNumber: number; field: string; code: string; message: string };
type Translate = (key: string, options?: Record<string, unknown>) => string;

// The BE writes the details (row, guest name, party size) only into its Vietnamese message;
// they are read back so the translated text stays as specific as the original.
function details(message: string) {
  return {
    line: /dòng (\d+)/i.exec(message)?.[1],
    name: /«([^»]+)»/.exec(message)?.[1],
    people: /thiệp (\d+) người/i.exec(message)?.[1],
  };
}

const detailed: Record<string, "line" | "name" | "people"> = {
  DUPLICATE_ROW_IN_FILE: "line",
  DUPLICATE_PHONE_IN_FILE: "line",
  DUPLICATE_EMAIL_IN_FILE: "line",
  DUPLICATE_NAME_IN_FILE: "line",
  GUEST_ALREADY_EXISTS: "name",
  PHONE_ALREADY_EXISTS: "name",
  EMAIL_ALREADY_EXISTS: "name",
  LARGE_PARTY: "people",
};

/** Text for one import issue in the current language; unknown codes fall back to the BE message. */
export function importIssueText(issue: RowIssue, t: Translate) {
  const params = details(issue.message);
  const needs = detailed[issue.code];
  const key =
    needs && params[needs]
      ? `issues.${issue.code}_detail`
      : issue.code === "INVALID_TEXT"
        ? `issues.INVALID_TEXT_${issue.field}`
        : `issues.${issue.code}`;
  return t(key, {
    ...params,
    defaultValue: t(`issues.${issue.code}`, { defaultValue: issue.message }),
  });
}

/** Issues grouped by spreadsheet row; row 0 holds the ones about the whole file. */
export function issuesByRow(issues: readonly RowIssue[] | undefined, t: Translate) {
  const map: Record<number, string[]> = {};
  for (const issue of issues ?? []) {
    const text = importIssueText(issue, t);
    const list = (map[issue.rowNumber] ??= []);
    if (!list.includes(text)) list.push(text);
  }
  return map;
}
