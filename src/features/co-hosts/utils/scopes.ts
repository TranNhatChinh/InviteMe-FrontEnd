import {
  CO_HOST_PERMISSIONS,
  isWeddingWideOnly,
  type CoHostPermission,
  type PermissionScope,
} from "../api/co-host.api";

export type ScopeDraft = Record<
  CoHostPermission,
  { enabled: boolean; weddingWide: boolean; groupIds: string[] }
>;

export const PERMISSION_LABELS: Record<CoHostPermission, string> = {
  GUEST_VIEW: "Xem danh sách khách",
  GUEST_EDIT: "Sửa thông tin khách",
  RSVP_VIEW: "Xem RSVP",
  SEATING_VIEW: "Xem sơ đồ chỗ ngồi",
  SEATING_EDIT: "Chỉnh sửa chỗ ngồi",
  CHECKIN_MANAGE: "Quản lý check-in",
  GIFT_RECORD: "Ghi nhận quà tại quầy",
};

/** The editor shows permissions by the part of the wedding they open, in this order. */
export const PERMISSION_AREAS: {
  key: "guests" | "seating" | "reception";
  permissions: CoHostPermission[];
}[] = [
  { key: "guests", permissions: ["GUEST_VIEW", "GUEST_EDIT", "RSVP_VIEW"] },
  { key: "seating", permissions: ["SEATING_VIEW", "SEATING_EDIT"] },
  { key: "reception", permissions: ["CHECKIN_MANAGE", "GIFT_RECORD"] },
];

/** What is wrong with one permission's scope, as a translation key; "" when it can be saved. */
export function permissionScopeError(permission: CoHostPermission, draft: ScopeDraft) {
  const scope = draft[permission];
  if (!scope.enabled) return "";
  if (isWeddingWideOnly(permission) && !scope.weddingWide)
    return permission === "GIFT_RECORD"
      ? "validation.giftRecordWeddingWide"
      : "validation.checkInWeddingWide";
  if (!scope.weddingWide && scope.groupIds.length === 0) return "validation.selectGroupOrWedding";
  return "";
}

export function emptyScopeDraft(): ScopeDraft {
  const draft: Partial<ScopeDraft> = {};
  for (const permission of CO_HOST_PERMISSIONS) {
    draft[permission] = { enabled: false, weddingWide: false, groupIds: [] };
  }
  return draft as ScopeDraft;
}

export function includeSeatingViewScope(draft: ScopeDraft): ScopeDraft {
  const edit = draft.SEATING_EDIT;
  if (!edit.enabled) return draft;

  const view = draft.SEATING_VIEW;
  const weddingWide = edit.weddingWide || (view.enabled && view.weddingWide);
  return {
    ...draft,
    SEATING_VIEW: {
      enabled: true,
      weddingWide,
      groupIds: weddingWide
        ? []
        : [...new Set([...(view.enabled ? view.groupIds : []), ...edit.groupIds])],
    },
  };
}

export function scopeDraftFromGrants(grants: PermissionScope[] | null | undefined): ScopeDraft {
  const draft = emptyScopeDraft();
  for (const grant of grants ?? []) {
    draft[grant.permission] = {
      enabled: true,
      weddingWide: grant.weddingWide,
      groupIds: grant.groupIds,
    };
  }
  return includeSeatingViewScope(draft);
}

export function grantsFromScopeDraft(draft: ScopeDraft): PermissionScope[] {
  return CO_HOST_PERMISSIONS.flatMap((permission) => {
    const scope = draft[permission];
    if (!scope.enabled) return [];
    return [
      {
        permission,
        weddingWide: scope.weddingWide,
        groupIds: scope.weddingWide ? [] : [...new Set(scope.groupIds)],
      },
    ];
  });
}

const fallbackValidation = {
  "validation.checkInWeddingWide":
    "Quyền check-in chỉ được cấp cho toàn bộ wedding. Hãy xác nhận phạm vi này.",
  "validation.giftRecordWeddingWide":
    "Quyền ghi nhận quà chỉ được cấp cho toàn bộ wedding. Hãy xác nhận phạm vi này.",
  "validation.selectGroupOrWedding":
    "Chọn ít nhất một nhóm khách hoặc cấp quyền trên toàn bộ wedding.",
  "validation.seatingViewScope":
    "Quyền chỉnh sửa chỗ ngồi cần quyền xem sơ đồ với phạm vi bao gồm các nhóm được sửa.",
};

export function scopeValidationMessage(
  grants: PermissionScope[],
  t: (key: string) => string = (key) =>
    fallbackValidation[key as keyof typeof fallbackValidation] ?? key,
) {
  const narrowReception = grants.find(
    (grant) => isWeddingWideOnly(grant.permission) && !grant.weddingWide,
  );
  if (narrowReception) {
    return t(
      narrowReception.permission === "GIFT_RECORD"
        ? "validation.giftRecordWeddingWide"
        : "validation.checkInWeddingWide",
    );
  }
  if (grants.some((grant) => !grant.weddingWide && grant.groupIds.length === 0)) {
    return t("validation.selectGroupOrWedding");
  }
  const seatingEdit = grants.find((grant) => grant.permission === "SEATING_EDIT");
  if (seatingEdit) {
    const seatingView = grants.find((grant) => grant.permission === "SEATING_VIEW");
    const viewCoversEdit =
      seatingView?.weddingWide === true ||
      (seatingView !== undefined &&
        !seatingEdit.weddingWide &&
        seatingEdit.groupIds.every((groupId) => seatingView.groupIds.includes(groupId)));
    if (!viewCoversEdit) {
      return t("validation.seatingViewScope");
    }
  }
  return "";
}
