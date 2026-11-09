"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormField } from "@/shared/forms/form-field";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { createPlanningGuestCreateSchema, type PlanningGuestCreate } from "../api/planning.api";

export function PlanningGuestCreateForm({
  groups,
  isWeddingWide,
  busy,
  onCancel,
  onSave,
}: {
  groups: { id: string; name: string }[];
  isWeddingWide: boolean;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: PlanningGuestCreate) => void;
}) {
  const { t } = useTranslation("guests");
  const schema = useMemo(
    () =>
      createPlanningGuestCreateSchema({
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
  const form = useForm<PlanningGuestCreate>({
    resolver: zodResolver(schema),
    defaultValues: {
      recipientName: "",
      honorific: "",
      expectedPeople: 1,
      side: "UNSPECIFIED",
      groupId: !isWeddingWide && groups.length === 1 ? (groups[0]?.id ?? null) : null,
      phone: "",
      note: "",
      email: "",
    },
  });

  function submit(values: PlanningGuestCreate) {
    if (!isWeddingWide && !values.groupId) {
      form.setError("groupId", {
        type: "manual",
        message: t("planning.validation.groupRequired"),
      });
      return;
    }
    onSave({
      ...values,
      honorific: values.honorific?.trim() || null,
      groupId: values.groupId || null,
      phone: values.phone?.trim() || null,
      note: values.note?.trim() || null,
      email: values.email?.trim() || null,
    });
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4"
      onSubmit={form.handleSubmit(submit)}
      aria-busy={busy}
      noValidate
    >
      <div>
        <h2 className="text-lg font-semibold">{t("planning.createTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("planning.createDescription")}</p>
      </div>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <FormField control={form.control} name="recipientName" label={t("planning.recipientName")}>
          {(field) => (
            <Input {...field} value={String(field.value ?? "")} maxLength={150} required />
          )}
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
        <FormField
          control={form.control}
          name="expectedPeople"
          label={t("planning.expectedPeople")}
        >
          {(field) => (
            <Input
              type="number"
              min={1}
              max={10}
              step={1}
              value={Number(field.value ?? 1)}
              onChange={(event) => field.onChange(Number(event.currentTarget.value))}
            />
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
              required={!isWeddingWide}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              {isWeddingWide && <option value="">{t("planning.noGroup")}</option>}
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
      {form.formState.errors.root?.server && (
        <p role="alert" className="text-sm text-destructive">
          {form.formState.errors.root.server.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? t("planning.creating") : t("planning.create")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          {t("planning.cancel")}
        </Button>
      </div>
    </form>
  );
}
