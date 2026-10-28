"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const readToken = () => new URLSearchParams(window.location.search).get("inviteToken");
const noToken = () => null;

export function StoryRsvp() {
  const value = useSyncExternalStore(subscribe, readToken, noToken);
  const token = value && /^[a-zA-Z0-9_-]{8,256}$/.test(value) ? value : null;
  return <div className="text-center">
    <p>Xác nhận tham dự qua thiệp mời cá nhân bạn đã nhận được.</p>
    {token && <a className="mt-4 inline-block rounded border px-5 py-3" href={`/invite/${encodeURIComponent(token)}`}>Mở thiệp mời và xác nhận</a>}
  </div>;
}
