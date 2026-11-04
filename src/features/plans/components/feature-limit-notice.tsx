"use client";

import Link from "next/link";
import { useId } from "react";
import { ArrowUpRight, Info, LockKeyhole, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

type FeatureLimitNoticeProps = {
  title: string;
  description: string;
  status?: "limited" | "unavailable";
  variant?: "compact" | "full";
  usage?: string;
  upgradeHref?: string;
  upgradeLabel?: string;
  retryLabel?: string;
  onRetry?: () => void;
};

/** Shared, copy-first notice for package restrictions and unknown entitlement state. */
export function FeatureLimitNotice({
  title,
  description,
  status = "limited",
  variant = "compact",
  usage,
  upgradeHref,
  upgradeLabel,
  retryLabel,
  onRetry,
}: FeatureLimitNoticeProps) {
  const compact = variant === "compact";
  const unavailable = status === "unavailable";
  const Icon = unavailable ? Info : LockKeyhole;
  const titleId = useId();

  return (
    <section
      role={unavailable ? "status" : undefined}
      aria-labelledby={titleId}
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-card shadow-sm sm:flex-row sm:items-center sm:justify-between",
        unavailable
          ? "border-border/80"
          : "border-primary/20 bg-gradient-to-r from-petal/75 via-card to-card",
        compact ? "p-4" : "p-5 sm:p-6",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-xl",
            compact ? "size-9" : "size-10",
            unavailable ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary-hover",
          )}
        >
          <Icon className={compact ? "size-4" : "size-5"} aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <h2 id={titleId} className="font-semibold text-foreground">
            {title}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          {usage && <p className="text-sm font-medium text-foreground">{usage}</p>}
        </div>
      </div>
      {upgradeHref && upgradeLabel ? (
        <Button asChild size={compact ? "sm" : "default"} className="min-h-10 shrink-0 rounded-xl">
          <Link href={upgradeHref}>
            {upgradeLabel}
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      ) : unavailable && onRetry && retryLabel ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-10 shrink-0 rounded-xl"
          onClick={onRetry}
        >
          <RefreshCw aria-hidden="true" />
          {retryLabel}
        </Button>
      ) : null}
    </section>
  );
}
