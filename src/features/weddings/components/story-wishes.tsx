"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { listStoryWishes, sendStoryWish } from "../api/website.api";

export function StoryWishes({ slug }: { slug?: string }) {
  const { api } = useRuntime();
  const cache = useQueryClient();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wishes = useQuery({
    queryKey: ["story-wishes", slug],
    queryFn: () => listStoryWishes(api, slug ?? ""),
    enabled: !!slug,
  });
  if (!slug)
    return (
      <p className="text-center text-sm">
        Form lời chúc sẽ xuất hiện trên website sau khi xuất bản.
      </p>
    );
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await sendStoryWish(api, slug, name.trim(), message.trim());
            setName("");
            setMessage("");
            await cache.invalidateQueries({ queryKey: ["story-wishes", slug] });
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Không gửi được lời chúc.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="grid gap-1 text-sm">
          Tên của bạn
          <input
            className="rounded-lg border px-3 py-2"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Lời chúc
          <textarea
            className="rounded-lg border px-3 py-2"
            required
            maxLength={1000}
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <button
          className="rounded-lg px-4 py-2 text-white disabled:opacity-50"
          style={{ background: "var(--story-accent)" }}
          disabled={busy}
        >
          {busy ? "Đang gửi…" : "Gửi lời chúc"}
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </form>
      {wishes.isPending && <p className="text-sm">Đang tải lời chúc…</p>}
      {wishes.data?.map((wish) => (
        <blockquote className="rounded-lg border bg-white p-4" key={wish.id}>
          <p>{wish.message}</p>
          <footer className="mt-2 text-sm font-semibold">{wish.name}</footer>
        </blockquote>
      ))}
    </div>
  );
}
