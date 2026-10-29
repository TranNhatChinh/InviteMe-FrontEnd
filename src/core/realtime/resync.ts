import type { Query } from "@tanstack/react-query";

/**
 * Which cached queries a resync must refetch. After a reconnect (since = null) all of them; on the first connection only
 * data fetched before it started, so a page load does not fetch everything twice. Queries still loading are left alone.
 */
export function staleForResync(since: number | null) {
  return (query: Query) =>
    since === null || (query.state.fetchStatus !== "fetching" && query.state.dataUpdatedAt < since);
}
