"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import type { CoHostPermission, PermissionScope } from "../api/co-host.api";
import { CO_HOST_PERMISSIONS, isWeddingWideOnly } from "../api/co-host.api";
import {
  includeSeatingViewScope,
  PERMISSION_AREAS,
  permissionScopeError,
  scopeDraftFromGrants,
  scopeValidationMessage,
  type ScopeDraft,
} from "../utils/scopes";

export function ScopeEditor({
  groups,
  initialGrants,
  submitLabel,
  busy,
  onSubmit,
  footerStart,
}: {
  groups: { id: string; name: string }[];
  initialGrants?: PermissionScope[] | null;
  submitLabel: string;
  busy: boolean;
  onSubmit: (grants: PermissionScope[]) => void;
  /** Rendered at the left of the save row, e.g. a destructive action that belongs to the same object. */
  footerStart?: ReactNode;
}) {
  const { t } = useTranslation("cohost");
  const idPrefix = useId();
  const [draft, setDraft] = useState<ScopeDraft>(() => scopeDraftFromGrants(initialGrants));
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  function updateDraft(update: (current: ScopeDraft) => ScopeDraft) {
    setDraft((current) => includeSeatingViewScope(update(current)));
  }

  function setScope(permission: CoHostPermission, patch: Partial<ScopeDraft[CoHostPermission]>) {
    updateDraft((current) => ({ ...current, [permission]: { ...current[permission], ...patch } }));
  }

  function togglePermission(permission: CoHostPermission, enabled: boolean) {
    // Reception permissions only exist for the whole wedding, so turning one on says so.
    setScope(
      permission,
      isWeddingWideOnly(permission) ? { enabled, weddingWide: true, groupIds: [] } : { enabled },
    );
  }

  function toggleGroup(permission: CoHostPermission, groupId: string) {
    updateDraft((current) => {
      const selected = current[permission].groupIds;
      return {
        ...current,
        [permission]: {
          ...current[permission],
          groupIds: selected.includes(groupId)
            ? selected.filter((id) => id !== groupId)
            : [...selected, groupId],
        },
      };
    });
  }

  const grants = CO_HOST_PERMISSIONS.flatMap((permission) => {
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

  function save() {
    setShowErrors(true);
    if (!grants.length) {
      setError(t("validation.selectPermission"));
      return;
    }
    const validationMessage = scopeValidationMessage(grants, t);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    setError("");
    onSubmit(grants);
  }

  return (
    <div className="space-y-6">
      {PERMISSION_AREAS.map((area) => (
        <fieldset key={area.key} className="space-y-2">
          <legend className="pb-1 text-sm font-semibold text-foreground">
            {t(`areas.${area.key}`)}
          </legend>
          <div className="divide-y divide-foreground/10 rounded-xl border border-foreground/10 bg-background">
            {area.permissions.map((permission) => {
              const scope = draft[permission];
              const inputId = `${idPrefix}-${permission}`;
              const hintId = `${inputId}-hint`;
              const errorKey = showErrors ? permissionScopeError(permission, draft) : "";
              const errorId = `${inputId}-error`;
              const lockedBySeatingEdit =
                permission === "SEATING_VIEW" && draft.SEATING_EDIT.enabled;
              return (
                <div key={permission} className="space-y-3 px-4 py-3">
                  <div className="flex min-h-11 items-start gap-3">
                    <input
                      id={inputId}
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-primary"
                      checked={scope.enabled}
                      disabled={lockedBySeatingEdit}
                      aria-describedby={cn(hintId, errorKey && errorId)}
                      onChange={(event) =>
                        togglePermission(permission, event.currentTarget.checked)
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <label htmlFor={inputId} className="cursor-pointer text-sm font-medium">
                        {t(`permissions.${permission}`)}
                      </label>
                      <p id={hintId} className="mt-0.5 text-sm text-muted-foreground">
                        {lockedBySeatingEdit
                          ? t("seatingViewLocked")
                          : t(`permissionHints.${permission}`)}
                      </p>
                    </div>
                    {scope.enabled && isWeddingWideOnly(permission) && scope.weddingWide && (
                      <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">
                        {t("wholeWedding")}
                      </span>
                    )}
                  </div>

                  {scope.enabled && !isWeddingWideOnly(permission) && (
                    <div className="space-y-3 pl-7">
                      <div
                        role="radiogroup"
                        aria-label={t("scopeFor", { permission: t(`permissions.${permission}`) })}
                        className="inline-flex rounded-lg bg-muted p-1"
                      >
                        {[
                          { value: true, label: t("wholeWedding") },
                          { value: false, label: t("selectedGroups") },
                        ].map((option) => (
                          <label
                            key={String(option.value)}
                            className={cn(
                              "relative inline-flex h-9 cursor-pointer items-center rounded-md px-3 text-sm transition-colors",
                              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                              scope.weddingWide === option.value
                                ? "bg-background font-medium text-foreground ring-1 ring-foreground/10"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            <input
                              type="radio"
                              className="sr-only"
                              name={`${inputId}-scope`}
                              aria-label={option.label}
                              checked={scope.weddingWide === option.value}
                              onChange={() =>
                                setScope(
                                  permission,
                                  option.value
                                    ? { weddingWide: true, groupIds: [] }
                                    : { weddingWide: false },
                                )
                              }
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>

                      {!scope.weddingWide &&
                        (groups.length ? (
                          <div
                            role="group"
                            aria-label={t("groupsFor", {
                              permission: t(`permissions.${permission}`),
                            })}
                            className="flex flex-wrap gap-2"
                          >
                            {groups.map((group) => {
                              const pressed = scope.groupIds.includes(group.id);
                              return (
                                <button
                                  key={group.id}
                                  type="button"
                                  aria-pressed={pressed}
                                  onClick={() => toggleGroup(permission, group.id)}
                                  className={cn(
                                    "inline-flex h-9 items-center rounded-full border px-3 text-sm transition-colors",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    pressed
                                      ? "border-primary bg-primary/10 font-medium text-foreground"
                                      : "border-foreground/15 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                                  )}
                                >
                                  {group.name}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">{t("noGroupsHint")}</p>
                        ))}
                    </div>
                  )}

                  {errorKey && (
                    <p id={errorId} className="pl-7 text-sm text-destructive">
                      {t(errorKey)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">{footerStart}</div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {t("selectedCount", { count: grants.length })}
          </span>
          <Button type="button" disabled={busy} onClick={save}>
            {busy ? t("saving") : submitLabel}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-right text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
