import { CheckInWorkspaceClient } from "./check-in-workspace-client";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ weddingId: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const [{ weddingId }, query] = await Promise.all([params, searchParams]);
  const requestedView = Array.isArray(query.view) ? query.view[0] : query.view;
  return (
    <CheckInWorkspaceClient
      weddingId={weddingId}
      initialView={requestedView === "overview" ? "overview" : "desk"}
    />
  );
}
