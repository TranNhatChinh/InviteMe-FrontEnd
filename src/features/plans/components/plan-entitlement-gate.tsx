"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LoadingState } from "@/shared/feedback/loading-state";
import { usePermission } from "@/shared/components/permission-guard";
import { FeatureLimitNotice } from "./feature-limit-notice";
import {
  planEntitlementState,
  useWeddingPlan,
  type PlanEntitlement,
} from "../hooks/use-wedding-plan";

export function PlanEntitlementGate({
  weddingId,
  entitlement,
  children,
}: {
  weddingId: string;
  entitlement: PlanEntitlement;
  children: ReactNode;
}) {
  const { t } = useTranslation("plans");
  const plan = useWeddingPlan(weddingId);
  const { isOwner } = usePermission();

  if (plan.isPending) return <LoadingState label={t("gate.loading")} />;
  if (plan.isError || !plan.data) {
    return (
      <FeatureLimitNotice
        status="unavailable"
        variant="full"
        title={t("gate.unknownTitle")}
        description={t("gate.unknownDescription")}
        retryLabel={t("gate.retry")}
        onRetry={() => void plan.refetch()}
      />
    );
  }

  const gate = planEntitlementState(plan.data, entitlement);
  if (!gate.locked) return <>{children}</>;

  const feature = t(`gate.features.${entitlement}`);
  const isLimitReached = gate.reason === "limit-reached";
  const title =
    entitlement === "checkin"
      ? t("gate.checkinTitle")
      : t(isLimitReached ? "gate.limitTitle" : "gate.notIncludedTitle", { feature });
  return (
    <FeatureLimitNotice
      variant="full"
      title={title}
      description={
        entitlement === "checkin"
          ? isOwner
            ? t("gate.checkinOwnerDescription")
            : t("gate.checkinContactOwner")
          : isOwner
            ? t(
                isLimitReached ? "gate.limitOwnerDescription" : "gate.notIncludedOwnerDescription",
                {
                  feature,
                  planName: plan.data.planName,
                },
              )
            : t("gate.contactOwner", { feature, planName: plan.data.planName })
      }
      upgradeHref={isOwner ? `/weddings/${encodeURIComponent(weddingId)}/plan` : undefined}
      upgradeLabel={isOwner ? t("gate.viewPlans") : undefined}
    />
  );
}
