"use client";

import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createPlanningGuestUpdateSchema,
  type PlanningDetail,
  type PlanningGuestUpdate,
} from "../api/planning.api";
import { FormField } from "@/shared/forms/form-field";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

export function PlanningGuestEditForm({
  guest,
  groups,
  busy,
  onDirtyChange,
  onCancel,
  onSave,
}: {
  guest: PlanningDetail;
  groups: { id: string; name: string }[];
  busy: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onSave: (input: PlanningGuestUpdate) => void;
}) {
  const { t } = useTranslation("guests");
  const schema = useMemo(
    () =>
      createPlanningGuestUpdateSchema({
        nameRequired: t("planning.validation.nameRequired"),
        nameMax: t("planning.validation.nameMax"),
        honorificMax: t("planning.validation.honorificMax"),
        phoneMax: t("planning.validation.phoneMax"),
        phoneInvalid: t("planning.validation.phoneInvalid"),
        noteMax: t("planning.validation.noteMax"),
        emailInvalid: t("planning.validation.emailInvalid"),
        versionInvalid: t("planning.validation.versionInvalid"),
        expectedPeopleMin: t("planning.validation.expectedPeopleMin"),
        expectedPeopleMax: t("planning.validation.expectedPeopleMax"),
      }),
    [t],
  );
  const form = useForm<PlanningGuestUpdate>({
    resolver: zodResolver(schema),
    defaultValues: {
      expectedVersion: guest.version,
      recipientName: guest.recipientName,
      honorific: guest.honorific ?? "",
      side: guest.side,
      groupId: guest.group?.id ?? null,
      phone: guest.phone ?? "",
      note: guest.note ?? "",
      email: guest.email ?? "",
    },
  });
  const { isDirty } = form.formState;

  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);

  return (
    <form
      className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4"
      onSubmit={form.handleSubmit(onSave)}
      aria-busy={busy}
    >
      <h3 className="font-semibold">{t("planning.editTitle")}</h3>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <FormField control={form.control} name="recipientName" label={t("planning.recipientName")}>
          {(field) => <Input {...field} value={String(field.value ?? "")} maxLength={150} />}
        </FormField>
        <FormField control={form.control} name="honorific" label={t("planning.honorific")}>
          {(field) => (
            <Input
              {...field}
              value={String(field.value ?? "")}
              maxLength={50}
              placeholder={t("planning.honorificPlaceholder")}
            />
          )}
        </FormField>
        <FormField control={form.control} name="email" label={t("planning.email")}>
          {(field) => (
            <Input {...field} value={String(field.value ?? "")} type="email" maxLength={254} />
          )}
        </FormField>
        <FormField control={form.control} name="phone" label={t("planning.phone")}>
          {(field) => (
            <Input {...field} value={String(field.value ?? "")} type="tel" maxLength={30} />
          )}
        </FormField>
        <FormField control={form.control} name="side" label={t("planning.side")}>
          {(field) => (
            <select
              {...field}
              value={String(field.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              {(["BRIDE", "GROOM", "MUTUAL", "UNSPECIFIED"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`planning.sideValues.${value}`)}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField control={form.control} name="groupId" label={t("planning.group")}>
          {(field) => (
            <select
              {...field}
              value={String(field.value ?? "")}
              onChange={(event) => field.onChange(event.currentTarget.value || null)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">{t("planning.noGroup")}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <div className="sm:col-span-2">
          <FormField control={form.control} name="note" label={t("planning.note")}>
            {(field) => (
              <textarea
                {...field}
                value={String(field.value ?? "")}
                maxLength={2000}
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
          </FormField>
        </div>
      </fieldset>
      <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t bg-card/95 px-4 py-3 backdrop-blur">
        <Button type="submit" disabled={busy}>
          {busy ? t("planning.saving") : t("planning.save")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          {t("planning.cancel")}
        </Button>
      </div>
    </form>
  );
}
