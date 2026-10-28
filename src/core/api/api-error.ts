export type ApiErrorCode =
  | "validation"
  | "unauthenticated"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "business-rule"
  | "server"
  | "network"
  | "configuration"
  | "invalid-response";

const errors: Record<number, [ApiErrorCode, string]> = {
  400: ["validation", "Please check the information you entered."],
  401: ["unauthenticated", "Please sign in to continue."],
  403: ["forbidden", "You do not have permission to perform this action."],
  404: ["not-found", "The requested item could not be found."],
  405: ["server", "The API does not support this operation yet. Please contact the project team."],
  409: ["conflict", "This data has changed. Reload the latest version and try again."],
  422: ["business-rule", "This action cannot be completed with the current information."],
};

/** One spreadsheet-row problem from a guest import: the code is translated, the message is the BE fallback. */
export type ApiRowIssue = { rowNumber: number; field: string; code: string; message: string };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly fieldErrors: Record<string, string[]> = {},
    public readonly backendCode?: string,
    public readonly rowIssues: ApiRowIssue[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function normalizeHttpError(status: number, body: unknown): ApiError {
  const [code, message] = errors[status] ?? [
    "server",
    "Something went wrong. Please try again later.",
  ];
  const backendCode =
    body && typeof body === "object" && "code" in body && typeof body.code === "string"
      ? body.code
      : undefined;
  const fieldErrors: Record<string, string[]> = {};
  // Never render backend detail/title/exception text. Only recognize field names.
  if (
    (status === 400 || status === 422) &&
    body &&
    typeof body === "object" &&
    "errors" in body &&
    body.errors &&
    typeof body.errors === "object"
  ) {
    if (Array.isArray(body.errors)) {
      const allowed = [
        "recipientName",
        "honorific",
        "invitationKind",
        "expectedPeople",
        "side",
        "group",
        "groupId",
        "phone",
        "email",
        "note",
        "rowNumber",
        "rows",
        "row",
      ];
      const rowIssues: ApiRowIssue[] = [];
      for (const issue of body.errors) {
        if (
          issue &&
          typeof issue === "object" &&
          Number.isSafeInteger(issue.rowNumber) &&
          issue.rowNumber >= 0 &&
          allowed.includes(issue.field)
        ) {
          fieldErrors[`rows.${issue.rowNumber}.${issue.field}`] = ["Please check this value."];
          // Import issues are written for the couple (codes + row-level text), unlike exception detail.
          if (typeof issue.code === "string" && typeof issue.message === "string")
            rowIssues.push({
              rowNumber: issue.rowNumber,
              field: issue.field,
              code: issue.code,
              message: issue.message.slice(0, 500),
            });
        }
      }
      return new ApiError(status, code, message, fieldErrors, backendCode, rowIssues);
    }
    for (const key of Object.keys(body.errors)) fieldErrors[key] = ["Please check this value."];
  }
  return new ApiError(status, code, message, fieldErrors, backendCode);
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
