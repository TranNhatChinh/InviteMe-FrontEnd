"use client";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/core/api/api-error";
import { useRuntime } from "@/core/config/runtime";
import { usePermission } from "@/shared/components/permission-guard";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/feedback/confirm-dialog";
import { CoupleImport } from "./couple-import";
import {
  archivePlanningGuest,
  createPlanningGuest,
  restorePlanningGuest,
  importBody,
  importGuests,
  checkImportGuests,
  listPlanningGuests,
  getPlanningGuest,
  listPlanningGroups,
  updatePlanningGuest,
  sideLabels,
  type PlanningGuestCreate,
  type PlanningGuestUpdate,
} from "../api/planning.api";
import type { CoupleRow } from "../utils/couple-import";
import Link from "next/link";
import { Copy, ExternalLink } from "lucide-react";
import { PlanningGuestEditForm } from "./planning-guest-edit-form";
import { PlanningGuestCreateForm } from "./planning-guest-create-form";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/i18n/format";
import { useLocale } from "@/i18n/language-context";

export function PlanningDashboard({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("guestPlanning");
  const { language } = useLocale();
  const { api } = useRuntime();
  const { can } = usePermission();
  const cache = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [creatingGuest, setCreatingGuest] = useState(false);
  const [archivedOnly, setArchivedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [side, setSide] = useState("");
  const [groupId, setGroupId] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [editingGuest, setEditingGuest] = useState(false);
  const [notice, setNotice] = useState("");
  async function copyInvitation(path: string) {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).href);
      setNotice(t("copied"));
    } catch {
      setNotice(t("copyFailed"));
    }
  }
  const attempt = useRef<{ serialized: string; key: string } | null>(null);
  const createAttempt = useRef<{ serialized: string; key: string } | null>(null);
  const list = useQuery({
    queryKey: ["guest-planning", weddingId, page, search, archivedOnly, side, groupId],
    queryFn: ({ signal }) =>
      listPlanningGuests(api, weddingId, page, search, signal, archivedOnly, { side, groupId }),
    enabled: can("GUEST_VIEW") && !importing,
  });
  const detail = useQuery({
    queryKey: ["guest-planning-detail", weddingId, selected, archivedOnly],
    queryFn: ({ signal }) => getPlanningGuest(api, weddingId, selected ?? "", signal, archivedOnly),
    enabled: !!selected && can("GUEST_VIEW"),
  });
  const groups = useQuery({
    queryKey: ["guest-planning-groups", weddingId],
    queryFn: ({ signal }) => listPlanningGroups(api, weddingId, signal),
    enabled: can("GUEST_VIEW"),
  });
  const createGuest = useMutation({
    mutationFn: ({ input, key }: { input: PlanningGuestCreate; key: string }) =>
      createPlanningGuest(api, weddingId, input, key),
    onSuccess: async (guest) => {
      createAttempt.current = null;
      setCreatingGuest(false);
      setSelected(guest.id);
      setEditingGuest(false);
      setNotice(guest.possibleDuplicate ? t("createdWithDuplicateWarning") : t("created"));
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["guest-planning", weddingId] }),
        cache.invalidateQueries({ queryKey: ["guest-planning-detail", weddingId] }),
        cache.invalidateQueries({ queryKey: ["guest-planning-groups", weddingId] }),
      ]);
    },
    onError: (error) => {
      setNotice(
        error instanceof ApiError &&
          error.status === 400 &&
          Object.keys(error.fieldErrors).some((field) => field.toLowerCase() === "groupid")
          ? t("errors.groupRequired")
          : error instanceof ApiError && error.status === 403
            ? t("errors.createForbidden")
            : error instanceof ApiError && error.status === 404
              ? t("errors.scopeChanged")
              : error instanceof ApiError && error.status === 409
                ? t("errors.createConflict")
                : error instanceof ApiError && error.code === "network"
                  ? t("errors.networkCreate")
                  : t("errors.createFailed"),
      );
    },
  });
  const updateGuest = useMutation({
    mutationFn: ({ guestId, input }: { guestId: string; input: PlanningGuestUpdate }) =>
      updatePlanningGuest(api, weddingId, guestId, input),
    onSuccess: async () => {
      setEditingGuest(false);
      setNotice(t("updated"));
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["guest-planning", weddingId] }),
        cache.invalidateQueries({ queryKey: ["guest-planning-detail", weddingId, selected] }),
      ]);
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setNotice(t("updatedElsewhere"));
        await Promise.all([
          cache.invalidateQueries({ queryKey: ["guest-planning-detail", weddingId, selected] }),
          cache.invalidateQueries({ queryKey: ["guest-planning", weddingId] }),
        ]);
        return;
      }
      setNotice(
        error instanceof ApiError && error.status === 403
          ? t("errors.editForbidden")
          : error instanceof ApiError && error.code === "network"
            ? t("errors.networkSave")
            : t("errors.saveFailed"),
      );
    },
  });
  const archiveGuest = useMutation({
    mutationFn: ({ guestId, expectedVersion }: { guestId: string; expectedVersion: number }) =>
      archivePlanningGuest(api, weddingId, guestId, expectedVersion),
    onSuccess: async () => {
      setSelected(null);
      setEditingGuest(false);
      setNotice(t("archivedSuccessfully"));
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["guest-planning", weddingId] }),
        cache.invalidateQueries({ queryKey: ["guest-planning-detail", weddingId] }),
      ]);
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setNotice(t("archivedElsewhere"));
        await cache.invalidateQueries({ queryKey: ["guest-planning-detail", weddingId, selected] });
        return;
      }
      setNotice(
        error instanceof ApiError && error.status === 403
          ? t("errors.archiveForbidden")
          : error instanceof ApiError && error.backendCode === "GUEST_ALREADY_CHECKED_IN"
            ? t("errors.archiveCheckedIn")
            : error instanceof ApiError && error.status === 404
              ? t("errors.archiveOutOfScope")
              : t("errors.archiveFailed"),
      );
    },
  });
  const restoreGuest = useMutation({
    mutationFn: ({ guestId, expectedVersion }: { guestId: string; expectedVersion: number }) =>
      restorePlanningGuest(api, weddingId, guestId, expectedVersion),
    onSuccess: async (guest) => {
      setArchivedOnly(false);
      setSelected(guest.id);
      setEditingGuest(false);
      setPage(1);
      setNotice(t("restoredSuccessfully"));
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["guest-planning", weddingId] }),
        cache.invalidateQueries({ queryKey: ["guest-planning-detail", weddingId] }),
      ]);
    },
    onError: async (error) => {
      setNotice(
        error instanceof ApiError && error.status === 409
          ? t("restoredElsewhere")
          : error instanceof ApiError && error.status === 403
            ? t("errors.restoreForbidden")
            : t("errors.restoreFailed"),
      );
      await cache.invalidateQueries({ queryKey: ["guest-planning", weddingId] });
    },
  });
  function saveManualGuest(input: PlanningGuestCreate) {
    const serialized = JSON.stringify(input);
    if (createAttempt.current?.serialized !== serialized)
      createAttempt.current = { serialized, key: crypto.randomUUID() };
    createGuest.mutate({ input, key: createAttempt.current.key });
  }
  async function checkImport(rows: CoupleRow[], signal?: AbortSignal) {
    const body = importBody(rows);
    return await checkImportGuests(api, weddingId, body, signal);
  }
  async function save(rows: CoupleRow[]) {
    const body = importBody(rows),
      serialized = JSON.stringify(body);
    if (attempt.current?.serialized !== serialized)
      attempt.current = { serialized, key: crypto.randomUUID() };
    const result = await importGuests(api, weddingId, body, attempt.current.key);
    const skippedCount = result.skipped?.length ?? 0;
    const skippedText =
      skippedCount > 0
        ? " · Bỏ qua " + formatNumber(skippedCount, language) + " dòng đã có sẵn"
        : "";
    setNotice(
      "Đã thêm thành công " +
        formatNumber(result.createdGuestCount, language) +
        " thiệp (" +
        formatNumber(result.createdPlaceCount, language) +
        " khách)" +
        skippedText +
        "." +
        (result.warnings.length
          ? " Có " + formatNumber(result.warnings.length, language) + " dòng cần lưu ý trùng tên."
          : "")
    );
    await cache.invalidateQueries({ queryKey: ["guest-planning", weddingId] });
    setPage(1);
    setSearch("");
    setImporting(false);
    attempt.current = null;
  }
  if (importing)
    return (
      <CoupleImport
        onClose={() => setImporting(false)}
        onImport={save}
        onCheck={checkImport}
      />
    );
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl">{t("title")}</h1>
        {can("SEATING_VIEW") && (
          <Button variant="outline" asChild>
            <Link href={`/weddings/${weddingId}/seating`}>{t("seating")}</Link>
          </Button>
        )}
        {can("GUEST_EDIT") && !archivedOnly && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                createAttempt.current = null;
                setNotice("");
                setCreatingGuest((value) => !value);
              }}
            >
              {creatingGuest ? t("closeForm") : t("addGuest")}
            </Button>
            <Button
              onClick={() => {
                attempt.current = null;
                setImporting(true);
              }}
            >
              {t("import")}
            </Button>
          </div>
        )}
      </div>
      {notice && (
        <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
          {notice}
        </p>
      )}
      {creatingGuest && can("GUEST_EDIT") && (
        <div className="space-y-3">
          {groups.isPending ? (
            <p role="status">{t("loadingGroups")}</p>
          ) : groups.isError ? (
            <p role="alert">{t("groupLoadFailed")}</p>
          ) : !groups.data?.isWeddingWide && groups.data?.items.length === 0 ? (
            <p role="alert">{t("noAssignedGroups")}</p>
          ) : (
            <PlanningGuestCreateForm
              groups={groups.data.items}
              isWeddingWide={groups.data.isWeddingWide}
              busy={createGuest.isPending}
              onCancel={() => {
                setCreatingGuest(false);
                createAttempt.current = null;
              }}
              onSave={saveManualGuest}
            />
          )}
        </div>
      )}
      {!can("GUEST_VIEW") ? (
        <p>{t("noViewPermission")}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("filterStatus")}>
            <Button
              type="button"
              variant={!archivedOnly ? "default" : "outline"}
              aria-pressed={!archivedOnly}
              onClick={() => {
                setArchivedOnly(false);
                setSelected(null);
                setEditingGuest(false);
                setPage(1);
              }}
            >
              {t("active")}
            </Button>
            <Button
              type="button"
              variant={archivedOnly ? "default" : "outline"}
              aria-pressed={archivedOnly}
              onClick={() => {
                setArchivedOnly(true);
                setSelected(null);
                setEditingGuest(false);
                setPage(1);
              }}
            >
              {t("archived")}
            </Button>
          </div>
          <input
            aria-label={t("searchRecipient")}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-lg border p-3"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              {t("side")}
              <select
                className="h-10 rounded-lg border bg-background px-3"
                value={side}
                onChange={(event) => {
                  setSide(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t("allSides")}</option>
                {Object.entries(sideLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {t(`sideValues.${value}`, { defaultValue: label })}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              {t("group")}
              <select
                className="h-10 rounded-lg border bg-background px-3"
                value={groupId}
                onChange={(event) => {
                  setGroupId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t("allGroups")}</option>
                {(groups.data?.items ?? []).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {groups.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t("groupsUnavailable")}
            </p>
          )}
          {list.isPending && <p role="status">{t("loadingList")}</p>}
          {list.isError && (
            <div role="alert">
              {t("listLoadFailed")}{" "}
              <Button variant="outline" onClick={() => void list.refetch()}>
                {t("retry")}
              </Button>
            </div>
          )}
          {list.data && (
            <>
              <p className="text-sm">
                {formatNumber(list.data.totalItems, language)}{" "}
                {archivedOnly ? t("archivedCount") : t("recipientsCount")}
              </p>
              {!list.data.items.length && <p>{t("noMatches")}</p>}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead>
                    <tr>
                      {[t("recipient"), t("expected"), t("sideColumn"), t("group")].map((x) => (
                        <th key={x} className="p-3">
                          {x}
                        </th>
                      ))}
                      {can("INVITATION_SEND") && <th className="p-3">{t("personalInvitation")}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.items.map((g) => (
                      <tr key={g.id} className="border-t">
                        <td className="p-3">
                          <button
                            className="text-left underline underline-offset-4"
                            onClick={() => {
                              setEditingGuest(false);
                              setSelected(g.id);
                            }}
                          >
                            {g.invitationKind === "FAMILY"
                              ? `${t("family")} `
                              : g.invitationKind === "GROUP"
                                ? `${t("groupPrefix")} `
                                : ""}
                            {g.honorific ? `${g.honorific} ` : ""}
                            {g.recipientName}
                          </button>
                          {g.archivedAt && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {t("archived")}
                            </span>
                          )}
                        </td>
                        <td className="p-3">{g.expectedPeople}</td>
                        <td className="p-3">{sideLabels[g.side]}</td>
                        <td className="p-3">{g.group?.name ?? t("notGrouped")}</td>
                        {can("INVITATION_SEND") && (
                          <td className="p-3">
                            {g.invitationPath ? (
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <Button variant="outline" size="sm" asChild>
                                  <a
                                    href={g.invitationPath}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="size-4" aria-hidden="true" />
                                    {t("openInvitation")}
                                  </a>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={t("copyInvitationFor", { name: g.recipientName })}
                                  title={t("copyInvitation")}
                                  onClick={() => {
                                    if (g.invitationPath) void copyInvitation(g.invitationPath);
                                  }}
                                >
                                  <Copy className="size-4" aria-hidden="true" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">{t("noInvitationLink")}</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  {t("previous")}
                </Button>
                <span>{t("page", { page: formatNumber(page, language) })}</span>
                <Button
                  variant="outline"
                  disabled={page * 20 >= list.data.totalItems}
                  onClick={() => setPage(page + 1)}
                >
                  {t("next")}
                </Button>
              </div>
            </>
          )}
          {selected && (
            <section className="space-y-3 rounded-xl border p-5" aria-label={t("detail")}>
              <Button variant="outline" onClick={() => setSelected(null)}>
                {t("closeDetails")}
              </Button>
              {detail.isPending && <p>{t("loading")}</p>}
              {detail.isError && (
                <p role="alert">
                  {t("detailLoadFailed")}{" "}
                  <button onClick={() => void detail.refetch()}>{t("retry")}</button>
                </p>
              )}
              {detail.data && (
                <>
                  {can("GUEST_EDIT") && !editingGuest && !detail.data.archivedAt && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => setEditingGuest(true)}>
                        {t("edit")}
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button variant="destructive" disabled={archiveGuest.isPending}>
                            {t("archive")}
                          </Button>
                        }
                        title={t("archiveTitle")}
                        description={t("archiveDescription")}
                        cancelLabel={t("cancel")}
                        confirmLabel={archiveGuest.isPending ? t("archiving") : t("archive")}
                        onConfirm={() =>
                          archiveGuest.mutate({
                            guestId: detail.data.id,
                            expectedVersion: detail.data.version,
                          })
                        }
                      />
                    </div>
                  )}
                  {can("GUEST_EDIT") && detail.data.archivedAt && !editingGuest && (
                    <ConfirmDialog
                      trigger={<Button disabled={restoreGuest.isPending}>{t("restore")}</Button>}
                      title={t("restoreTitle")}
                      description={t("restoreDescription")}
                      cancelLabel={t("cancel")}
                      confirmLabel={restoreGuest.isPending ? t("restoring") : t("restore")}
                      onConfirm={() =>
                        restoreGuest.mutate({
                          guestId: detail.data.id,
                          expectedVersion: detail.data.version,
                        })
                      }
                    />
                  )}
                  {editingGuest && can("GUEST_EDIT") ? (
                    groups.isPending ? (
                      <p role="status">{t("loadingGroups")}</p>
                    ) : groups.isError ? (
                      <p role="alert">{t("groupsLoadFailed")}</p>
                    ) : (
                      <PlanningGuestEditForm
                        key={`${detail.data.id}-${detail.data.version}`}
                        guest={detail.data}
                        groups={[
                          ...(detail.data.group &&
                          !groups.data.items.some((group) => group.id === detail.data.group?.id)
                            ? [{ id: detail.data.group.id, name: detail.data.group.name }]
                            : []),
                          ...groups.data.items,
                        ]}
                        busy={updateGuest.isPending}
                        onCancel={() => setEditingGuest(false)}
                        onSave={(input) => updateGuest.mutate({ guestId: detail.data.id, input })}
                      />
                    )
                  ) : (
                    <>
                      <h2 className="text-xl">{detail.data.recipientName}</h2>
                      <p>
                        {detail.data.phone || t("noPhone")} ·{" "}
                        {formatNumber(detail.data.expectedPeople, language)} {t("expectedPeople")}
                      </p>
                      <p>{detail.data.note}</p>
                      <ol className="list-inside list-decimal space-y-2">
                        {detail.data.places.map((p) => (
                          <li key={p.id}>
                            {p.person
                              ? `${p.person.fullName} · ${t(`attendance.${p.person.attendanceStatus}`, { defaultValue: p.person.attendanceStatus })}`
                              : t("unnamedPlace")}
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
