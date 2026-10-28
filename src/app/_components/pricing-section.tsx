"use client";

import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { useCurrentUser } from "@/features/auth";
import { PricingTable } from "@/features/plans";
import { getWeddings } from "@/features/weddings";

/**
 * The pricing table with buttons that fit who is looking: a visitor registers with the plan, a signed-in
 * couple buys it for one of their weddings (straight to it when there is only one).
 */
export function PricingSection({ embedded = false }: { embedded?: boolean }) {
  const { api } = useRuntime();
  const { user } = useCurrentUser();
  const isHost = !!user && user.role !== "ADMIN";
  const weddings = useQuery({
    queryKey: ["pricing-weddings", user?.id],
    queryFn: ({ signal }) => getWeddings(api, { page: 1, pageSize: 2 }, signal),
    enabled: isHost,
    staleTime: 60_000,
  });

  if (!user) return <PricingTable embedded={embedded} />;

  const items = weddings.data?.items ?? [];
  const planHref = (code: string) => {
    const plan = encodeURIComponent(code);
    if (items.length === 1 && items[0]) return `/weddings/${items[0].id}/plan?plan=${plan}`;
    if (weddings.isSuccess && items.length === 0) return `/weddings/new?plan=${plan}`;
    return `/weddings?plan=${plan}`;
  };
  return (
    <PricingTable
      embedded={embedded}
      startHref={user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard"}
      planHref={planHref}
    />
  );
}
