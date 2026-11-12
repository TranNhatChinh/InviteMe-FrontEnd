"use client";

import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

const subscribe = () => () => {};
const readToken = () => new URLSearchParams(window.location.search).get("inviteToken");
const noToken = () => null;

export function StoryRsvp({ label }: { label?: string } = {}) {
  const { t } = useTranslation("public");
  const value = useSyncExternalStore(subscribe, readToken, noToken);
  const token = value && /^[a-zA-Z0-9_-]{8,256}$/.test(value) ? value : null;
  return <div className="text-center">
    <p>{t("storyRsvp.description")}</p>
    {token && <a className="mt-4 inline-block rounded border px-5 py-3" href={`/invite/${encodeURIComponent(token)}`}>{label || t("storyRsvp.openInvitation")}</a>}
  </div>;
}
