"use client";

import { useTranslation } from "react-i18next";
import { EmptyState } from "@/shared/feedback/empty-state";

type RsvpSection = "responses" | "reminders" | "requests";

export function RsvpPermissionFallback({ section }: { section: RsvpSection }) {
  const { t } = useTranslation("guests");
  const namespace =
    section === "responses" ? "hostRsvp" : section === "reminders" ? "reminder" : "queues";

  return (
    <EmptyState
      title={t(`${namespace}.accessRestrictedTitle`)}
      description={t(`${namespace}.accessRestrictedDescription`)}
    />
  );
}
