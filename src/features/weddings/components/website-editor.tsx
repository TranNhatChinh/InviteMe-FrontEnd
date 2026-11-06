"use client";

import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { SessionLoading } from "@/shared/feedback/session-loading";
import { ErrorState } from "@/shared/feedback/error-state";
import { getWebsite } from "../api/website.api";
import { getWeddingSetup } from "../api/wedding.api";
import { weddingKeys } from "../api/wedding.keys";
import { WeddingWebsiteBuilderV4 } from "./website-builder-v4";

/** Canonical route for the wedding website builder. Legacy documents enter a read-only migration screen. */
export function WebsiteEditor({ weddingId }: { weddingId: string }) {
  const { api } = useRuntime();
  const website = useQuery({ queryKey: ["website", weddingId], queryFn: ({ signal }) => getWebsite(api, weddingId, signal) });
  const setup = useQuery({ queryKey: weddingKeys.detail(weddingId), queryFn: ({ signal }) => getWeddingSetup(api, weddingId, signal) });
  if (website.isPending || setup.isPending) return <SessionLoading />;
  if (website.isError) return <ErrorState error={website.error} retry={() => void website.refetch()} />;
  if (setup.isError || !setup.data) return <ErrorState error={setup.error ?? new Error("Không tải được thông tin đám cưới.")} retry={() => void setup.refetch()} />;
  return <WeddingWebsiteBuilderV4 weddingId={weddingId} site={website.data} setup={setup.data} />;
}
