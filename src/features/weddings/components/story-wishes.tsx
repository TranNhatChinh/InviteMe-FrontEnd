"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Heart, MessageCircle, PenLine, RotateCcw, Trash2 } from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import { ConfirmDialog } from "@/shared/feedback/confirm-dialog";
import {
  deleteStoryWish,
  deleteStoryWishComment,
  listStoryWishComments,
  listStoryWishes,
  sendStoryWish,
  sendStoryWishComment,
  setStoryWishLiked,
  type StoryWish,
  type StoryWishCommentPage,
} from "../api/website.api";

const visitorKeyStorage = "inviteme:public-wishes:visitor:v1";
const commentPageSize = 20;

function getVisitorKey() {
  try {
    const saved = window.localStorage.getItem(visitorKeyStorage);
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
    const created = window.crypto.randomUUID();
    window.localStorage.setItem(visitorKeyStorage, created);
    return created;
  } catch {
    return window.crypto.randomUUID();
  }
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function wishBubbleStyle(index: number): CSSProperties {
  return {
    "--wish-delay": `${index * 1.05}s`,
    "--wish-duration": `${7.2 + (index % 3) * 0.8}s`,
    "--wish-drift": `${index % 2 === 0 ? "22px" : "-22px"}`,
  } as CSSProperties;
}

export function StoryWishes({
  slug,
  weddingId,
  canModerate = false,
  variant = "default",
  displayLimit = 3,
  allowLikes = false,
  allowComments = false,
}: {
  slug?: string;
  weddingId?: string;
  canModerate?: boolean;
  variant?: "default" | "fountain";
  displayLimit?: number;
  allowLikes?: boolean;
  allowComments?: boolean;
}) {
  const { api } = useRuntime();
  const cache = useQueryClient();
  const submitLock = useRef(false);
  const [visitorKey, setVisitorKey] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [wishArchiveOpen, setWishArchiveOpen] = useState(false);
  const [visibleWishCount, setVisibleWishCount] = useState(displayLimit === 0 ? Number.MAX_SAFE_INTEGER : displayLimit);
  const [fountainReplay, setFountainReplay] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [moderationMessage, setModerationMessage] = useState("");
  const [moderationError, setModerationError] = useState("");
  const [deletingWishId, setDeletingWishId] = useState<string | null>(null);
  const wishListKey = ["story-wishes", slug, visitorKey] as const;
  const wishes = useQuery({
    queryKey: wishListKey,
    queryFn: () => listStoryWishes(api, slug ?? "", visitorKey),
    enabled: Boolean(slug && visitorKey),
  });
  const wishesStyle = {
    "--wishes-accent": "var(--site-accent, var(--story-accent, #b65b70))",
    "--wishes-rule": "color-mix(in srgb, var(--wishes-accent) 24%, transparent)",
  } as CSSProperties;

  useEffect(() => setVisitorKey(getVisitorKey()), []);
  useEffect(() => setVisibleWishCount(displayLimit === 0 ? Number.MAX_SAFE_INTEGER : displayLimit), [displayLimit]);
  useEffect(() => setWishArchiveOpen(false), [variant]);

  async function removeWish(wishId: string) {
    if (!weddingId || deletingWishId) return;
    setDeletingWishId(wishId);
    setModerationError("");
    setModerationMessage("");
    try {
      await deleteStoryWish(api, weddingId, wishId);
      cache.setQueryData<StoryWish[]>(wishListKey, current => current?.filter(wish => wish.id !== wishId));
      cache.removeQueries({ queryKey: ["story-wish-comments", slug, wishId] });
      setModerationMessage("Đã xóa lời chúc khỏi website.");
      void cache.invalidateQueries({ queryKey: ["story-wishes", slug] });
    } catch (cause) {
      setModerationError(cause instanceof Error ? cause.message : "Không xóa được lời chúc.");
    } finally {
      setDeletingWishId(null);
    }
  }

  if (!slug) {
    return (
      <div className={`story-wishes mx-auto max-w-2xl space-y-4 ${variant === "fountain" ? "story-wishes--fountain" : ""}`} style={wishesStyle}>
        <p className="rounded-xl bg-white/60 p-4 text-center text-sm opacity-70">
          Khách có thể gửi lời chúc sau khi website được xuất bản.
        </p>
        {variant === "fountain" && <div data-wish-stream data-wish-replay={fountainReplay ? "1" : "0"} className="wish-bubble-stage" aria-hidden="true">
          {["Chúc hai bạn luôn yêu thương và đồng hành cùng nhau.", "Mong mỗi ngày bên nhau đều tràn ngập niềm vui.", "Chúc đôi bạn có một hành trình thật hạnh phúc."].map((sample, index) => <article key={sample} data-floating-wish style={wishBubbleStyle(index)}><span className="wish-bubble-name">Lời chúc minh họa {index + 1}</span><p>{sample}</p></article>)}
        </div>}
        {variant === "fountain" && <button type="button" onClick={() => setFountainReplay(value => !value)} className="mx-auto inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--wishes-rule)] bg-white/70 px-3 text-xs font-medium text-[var(--wishes-accent)]"><RotateCcw className="size-3.5" />Xem lại hiệu ứng</button>}
        {(allowLikes || allowComments) && (
          <div className="rounded-xl border border-[var(--wishes-rule)] bg-white/75 p-4">
            <p className="text-sm opacity-70">Tương tác sẽ xuất hiện bên dưới mỗi lời chúc.</p>
            <div className="mt-3 flex gap-2">
              {allowLikes && <button type="button" disabled className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--wishes-rule)] px-3 text-sm opacity-65"><Heart className="size-4" />Thả tim</button>}
              {allowComments && <button type="button" disabled className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--wishes-rule)] px-3 text-sm opacity-65"><MessageCircle className="size-4" />Bình luận</button>}
            </div>
          </div>
        )}
      </div>
    );
  }
  const publicSlug = slug;

  async function submitWish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current || !visitorKey) return;
    const trimmedName = name.trim();
    const trimmedMessage = message.trim();
    if (!trimmedName || !trimmedMessage) {
      setSuccess("");
      setError("Vui lòng nhập tên và lời chúc trước khi gửi.");
      return;
    }

    submitLock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const created = await sendStoryWish(api, publicSlug, trimmedName, trimmedMessage);
      cache.setQueryData<StoryWish[]>(wishListKey, current => [created, ...(current ?? [])].slice(0, 100));
      setName("");
      setMessage("");
      setComposerOpen(false);
      setSuccess("Lời chúc đã được gửi và hiển thị trên website.");
      void cache.invalidateQueries({ queryKey: wishListKey });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không gửi được lời chúc.");
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={`story-wishes mx-auto max-w-2xl space-y-5 ${variant === "fountain" ? "story-wishes--fountain" : ""}`} style={wishesStyle}>
      {canModerate && weddingId && <>
        <p className="rounded-xl border border-[var(--wishes-rule)] bg-white/60 px-3 py-2 text-xs leading-5 opacity-75">Chế độ quản lý: dùng biểu tượng thùng rác để xóa lời chúc hoặc bình luận khỏi website.</p>
        {moderationMessage && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{moderationMessage}</p>}
        {moderationError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{moderationError}</p>}
      </>}
      <div className="overflow-hidden rounded-2xl border border-[var(--wishes-rule)] bg-white/70">
        <button type="button" aria-expanded={composerOpen} onClick={() => { setComposerOpen(open => !open); setError(""); }} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--wishes-accent)]">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--wishes-accent)]/10 text-[var(--wishes-accent)]"><PenLine className="size-4" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Gửi lời chúc</span><span className="block text-xs opacity-65">Viết lời nhắn gửi đến đôi bạn</span></span>
          {composerOpen ? <ChevronUp className="size-4 shrink-0 opacity-65" /> : <ChevronDown className="size-4 shrink-0 opacity-65" />}
        </button>
        {success && <p role="status" aria-live="polite" className="mx-4 mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</p>}
        {composerOpen && <form onSubmit={submitWish} className="grid gap-3 border-t border-[var(--wishes-rule)] p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
            <label className="grid content-start gap-1.5 text-xs"><span className="font-medium">Tên của bạn</span><input className="min-h-10 rounded-lg border border-[var(--wishes-rule)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--wishes-accent)] focus:ring-2 focus:ring-[var(--wishes-accent)]/15 disabled:opacity-60" required minLength={1} maxLength={100} autoComplete="name" disabled={busy} value={name} onChange={event => { setName(event.target.value); setError(""); setSuccess(""); }} placeholder="Tên hiển thị" /></label>
            <label className="grid gap-1.5 text-xs"><span className="font-medium">Lời chúc</span><textarea className="min-h-20 resize-y rounded-lg border border-[var(--wishes-rule)] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[var(--wishes-accent)] focus:ring-2 focus:ring-[var(--wishes-accent)]/15 disabled:opacity-60" required minLength={1} maxLength={1000} disabled={busy} value={message} onChange={event => { setMessage(event.target.value); setError(""); setSuccess(""); }} placeholder="Chúc hai bạn thật nhiều hạnh phúc…" /></label>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 opacity-65">Lời chúc sẽ hiển thị công khai trên website.</p>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setComposerOpen(false)} className="min-h-10 rounded-full px-4 text-sm opacity-70 hover:bg-black/5">Đóng</button><button type="submit" disabled={busy || !visitorKey} className="min-h-10 rounded-full px-4 text-sm font-medium text-white transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wishes-accent)] disabled:cursor-not-allowed disabled:opacity-55" style={{ background: "var(--wishes-accent)" }}>{busy ? "Đang gửi…" : !visitorKey ? "Đang chuẩn bị…" : "Gửi lời chúc"}</button></div>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        </form>}
      </div>

      <section aria-label="Lời chúc của khách" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-lg sm:text-xl" style={{ fontFamily: "var(--site-heading, var(--story-heading-font, Georgia))" }}>Lời chúc từ khách</h3>
          <div className="flex items-center gap-2">
            {wishes.data && <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-1 text-xs opacity-70">{wishes.data.length} lời chúc</span>}
            {variant === "fountain" && wishes.data && wishes.data.length > 0 && <button type="button" onClick={() => setFountainReplay(value => !value)} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--wishes-rule)] bg-white/70 px-2.5 text-[11px] font-medium text-[var(--wishes-accent)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wishes-accent)]"><RotateCcw className="size-3.5" /><span className="hidden sm:inline">Xem lại hiệu ứng</span><span className="sm:hidden">Xem lại</span></button>}
          </div>
        </div>
        {wishes.isPending && <p className="rounded-xl bg-white/60 p-4 text-sm opacity-70">Đang tải lời chúc…</p>}
        {wishes.isError && <div className="rounded-xl border border-[var(--wishes-rule)] bg-white/70 p-4" role="alert"><p className="text-sm">Chưa tải được lời chúc. Vui lòng thử lại.</p><button type="button" className="mt-3 min-h-10 rounded-full border border-[var(--wishes-rule)] px-4 text-sm hover:bg-black/5" onClick={() => void wishes.refetch()}>Tải lại lời chúc</button></div>}
        {wishes.data?.length === 0 && <p className="rounded-xl bg-white/60 p-4 text-center text-sm opacity-70">Chưa có lời chúc nào. Hãy là người đầu tiên gửi lời thương nhé.</p>}
        {variant === "fountain" && wishes.data && wishes.data.length > 0 && <div data-wish-stream data-wish-replay={fountainReplay ? "1" : "0"} className="wish-bubble-stage" aria-hidden="true">
          {wishes.data.slice(0, 6).map((wish, index) => <article key={wish.id} data-floating-wish style={wishBubbleStyle(index)}><span className="wish-bubble-name">{wish.name}</span><p>{wish.message}</p></article>)}
        </div>}
        {variant === "fountain" && wishes.data && wishes.data.length > 0 && <button type="button" aria-expanded={wishArchiveOpen} onClick={() => setWishArchiveOpen(open => !open)} className="min-h-11 w-full rounded-xl border border-[var(--wishes-rule)] bg-white/70 px-4 text-sm font-medium text-[var(--wishes-accent)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wishes-accent)]">{wishArchiveOpen ? "Thu gọn danh sách" : `Đọc lời chúc và xem tương tác · ${wishes.data.length}`}</button>}
        {(variant !== "fountain" || wishArchiveOpen) && <div data-wish-list className="space-y-3">
          {wishes.data?.slice(0, visibleWishCount).map(wish => <StoryWishCard key={wish.id} slug={publicSlug} weddingId={weddingId} canModerate={canModerate} deletingWish={deletingWishId === wish.id} anyWishDeleting={deletingWishId !== null} onDeleteWish={() => void removeWish(wish.id)} wish={wish} visitorKey={visitorKey} allowLikes={allowLikes} allowComments={allowComments} wishListKey={wishListKey} />)}
        </div>}
        {(variant !== "fountain" || wishArchiveOpen) && displayLimit > 0 && wishes.data && wishes.data.length > visibleWishCount && <button type="button" onClick={() => setVisibleWishCount(count => Math.min(wishes.data?.length ?? count, count + displayLimit))} className="min-h-10 w-full rounded-xl border border-[var(--wishes-rule)] bg-white/65 px-4 text-sm font-medium text-[var(--wishes-accent)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wishes-accent)]">Xem thêm {Math.min(displayLimit, wishes.data.length - visibleWishCount)} lời chúc</button>}
        {(variant !== "fountain" || wishArchiveOpen) && displayLimit > 0 && visibleWishCount > displayLimit && <button type="button" onClick={() => setVisibleWishCount(displayLimit)} className="mx-auto block min-h-9 px-4 text-xs opacity-65 underline underline-offset-4 hover:opacity-100">Thu gọn danh sách</button>}
      </section>
    </div>
  );
}

function StoryWishCard({
  slug, weddingId, canModerate, deletingWish, anyWishDeleting, onDeleteWish, wish, visitorKey, allowLikes, allowComments, wishListKey,
}: {
  slug: string; weddingId?: string; canModerate: boolean; deletingWish: boolean; anyWishDeleting: boolean; onDeleteWish: () => void; wish: StoryWish; visitorKey: string; allowLikes: boolean; allowComments: boolean;
  wishListKey: readonly ["story-wishes", string | undefined, string];
}) {
  const { api } = useRuntime();
  const cache = useQueryClient();
  const commentLock = useRef(false);
  const [likedBusy, setLikedBusy] = useState(false);
  const [likeError, setLikeError] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [visibleCommentCount, setVisibleCommentCount] = useState(3);
  const [commentName, setCommentName] = useState("");
  const [commentMessage, setCommentMessage] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [commentSuccess, setCommentSuccess] = useState("");
  const [commentDeleteError, setCommentDeleteError] = useState("");
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const commentsKey = ["story-wish-comments", slug, wish.id] as const;
  const comments = useInfiniteQuery({
    queryKey: commentsKey,
    queryFn: ({ pageParam }) => listStoryWishComments(api, slug, wish.id, pageParam, commentPageSize),
    initialPageParam: 0,
    getNextPageParam: lastPage => lastPage.hasMore ? lastPage.skip + lastPage.take : undefined,
    enabled: commentsOpen && allowComments,
  });
  const commentCount = comments.data?.pages[0]?.totalCount ?? wish.commentCount;
  const allComments = comments.data?.pages.flatMap(page => page.items) ?? [];
  const visibleComments = allComments.slice(0, visibleCommentCount);

  async function toggleLike() {
    if (likedBusy || !visitorKey) return;
    const liked = !wish.likedByMe;
    const previous = cache.getQueryData<StoryWish[]>(wishListKey);
    setLikedBusy(true);
    setLikeError("");
    cache.setQueryData<StoryWish[]>(wishListKey, current => current?.map(item => item.id === wish.id
      ? { ...item, likedByMe: liked, likeCount: Math.max(0, item.likeCount + (liked ? 1 : -1)) }
      : item));
    try {
      const result = await setStoryWishLiked(api, slug, wish.id, visitorKey, liked);
      cache.setQueryData<StoryWish[]>(wishListKey, current => current?.map(item => item.id === wish.id
        ? { ...item, likedByMe: result.liked, likeCount: result.likeCount }
        : item));
    } catch (cause) {
      if (previous) cache.setQueryData(wishListKey, previous);
      setLikeError(cause instanceof Error ? cause.message : "Chưa cập nhật được lượt tim.");
    } finally {
      setLikedBusy(false);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (commentLock.current) return;
    const name = commentName.trim();
    const message = commentMessage.trim();
    if (!name || !message) { setCommentError("Vui lòng nhập tên và bình luận."); return; }
    commentLock.current = true;
    setCommentBusy(true);
    setCommentError("");
    setCommentSuccess("");
    try {
      await sendStoryWishComment(api, slug, wish.id, name, message);
      setCommentName("");
      setCommentMessage("");
      setReplyOpen(false);
      setCommentSuccess("Đã gửi bình luận.");
      cache.setQueryData<StoryWish[]>(wishListKey, current => current?.map(item => item.id === wish.id ? { ...item, commentCount: item.commentCount + 1 } : item));
      void cache.invalidateQueries({ queryKey: commentsKey });
    } catch (cause) {
      setCommentError(cause instanceof Error ? cause.message : "Không gửi được bình luận.");
    } finally {
      commentLock.current = false;
      setCommentBusy(false);
    }
  }

  async function removeComment(commentId: string) {
    if (!weddingId || deletingCommentId) return;
    setDeletingCommentId(commentId);
    setCommentDeleteError("");
    setCommentSuccess("");
    try {
      await deleteStoryWishComment(api, weddingId, wish.id, commentId);
      cache.setQueryData<InfiniteData<StoryWishCommentPage>>(commentsKey, current => current ? {
        ...current,
        pages: current.pages.map(page => ({
          ...page,
          items: page.items.filter(comment => comment.id !== commentId),
          totalCount: Math.max(0, page.totalCount - 1),
        })),
      } : current);
      cache.setQueryData<StoryWish[]>(wishListKey, current => current?.map(item => item.id === wish.id
        ? { ...item, commentCount: Math.max(0, item.commentCount - 1) }
        : item));
      setCommentSuccess("Đã xóa bình luận khỏi website.");
      void cache.invalidateQueries({ queryKey: commentsKey });
      void cache.invalidateQueries({ queryKey: wishListKey });
    } catch (cause) {
      setCommentDeleteError(cause instanceof Error ? cause.message : "Không xóa được bình luận.");
    } finally {
      setDeletingCommentId(null);
    }
  }

  async function showMoreComments() {
    if (visibleCommentCount >= allComments.length && comments.hasNextPage) await comments.fetchNextPage();
    setVisibleCommentCount(count => Math.min(commentCount, count + 3));
  }

  return (
    <article className="rounded-xl border border-[var(--wishes-rule)] bg-white/75 px-4 py-3">
      <header className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--wishes-accent)]/10 text-xs font-semibold text-[var(--wishes-accent)]">{wish.name.trim().charAt(0).toLocaleUpperCase("vi-VN") || "•"}</span>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2"><div className="flex min-w-0 items-baseline justify-between gap-2"><p className="truncate text-sm font-semibold text-[var(--wishes-accent)]">{wish.name}</p><time dateTime={wish.createdAt} className="shrink-0 text-[11px] opacity-55">{displayDate(wish.createdAt)}</time></div>
          {canModerate && weddingId && <ConfirmDialog
            trigger={<button type="button" disabled={anyWishDeleting} aria-label={`Xóa lời chúc của ${wish.name}`} title="Xóa lời chúc" className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--wishes-accent)] transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wishes-accent)] disabled:opacity-50">{deletingWish ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <Trash2 className="size-4" />}</button>}
            title="Xóa lời chúc này?"
            description={`Lời chúc của ${wish.name} cùng các lượt tim và bình luận bên dưới sẽ bị xóa vĩnh viễn.`}
            confirmLabel="Xóa lời chúc"
            confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onConfirm={onDeleteWish}
          />}
        </div>
      </header>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{wish.message}</p>
      {(allowLikes || allowComments) && <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-[var(--wishes-rule)]/70 pt-2">
        {allowLikes && <button type="button" disabled={likedBusy || !visitorKey} aria-pressed={wish.likedByMe} aria-label={`${wish.likedByMe ? "Bỏ tim" : "Thả tim"} lời chúc của ${wish.name}, ${wish.likeCount} lượt tim`} onClick={() => void toggleLike()} className={`inline-flex min-h-8 items-center gap-1.5 text-xs transition hover:text-[var(--wishes-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--wishes-accent)] disabled:opacity-55 ${wish.likedByMe ? "font-semibold text-[var(--wishes-accent)]" : "opacity-70"}`}><Heart className={`size-4 ${wish.likedByMe ? "fill-current" : ""}`} />{wish.likeCount}</button>}
        {allowComments && <button type="button" aria-expanded={commentsOpen} onClick={() => setCommentsOpen(open => !open)} className="inline-flex min-h-8 items-center gap-1.5 text-xs opacity-70 transition hover:text-[var(--wishes-accent)] hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--wishes-accent)]"><MessageCircle className="size-4" />{commentCount} bình luận</button>}
      </div>}
      {likeError && <p role="alert" className="mt-2 text-sm text-red-700">{likeError}</p>}
      {allowComments && commentsOpen && <div className="mt-3 space-y-3 border-t border-[var(--wishes-rule)] pt-3">
        {comments.isPending && <p className="text-sm opacity-65">Đang tải bình luận…</p>}
        {comments.isError && <div role="alert" className="text-sm"><p>Chưa tải được bình luận.</p><button type="button" className="mt-1 underline underline-offset-4" onClick={() => void comments.refetch()}>Thử lại</button></div>}
        <div className="space-y-2">{visibleComments.map(comment => <div key={comment.id} className="border-l-2 border-[var(--wishes-rule)] pl-3">
          <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-baseline gap-2"><span className="truncate text-xs font-semibold">{comment.name}</span><time dateTime={comment.createdAt} className="shrink-0 text-[10px] opacity-55">{displayDate(comment.createdAt)}</time></div>
            {canModerate && weddingId && <ConfirmDialog
              trigger={<button type="button" disabled={deletingCommentId !== null} aria-label={`Xóa bình luận của ${comment.name}`} title="Xóa bình luận" className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--wishes-accent)] transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wishes-accent)] disabled:opacity-50"><Trash2 className="size-4" /></button>}
              title="Xóa bình luận này?"
              description={`Bình luận của ${comment.name} sẽ bị xóa vĩnh viễn khỏi website.`}
              confirmLabel="Xóa bình luận"
              confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onConfirm={() => void removeComment(comment.id)}
            />}
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 opacity-85">{comment.message}</p>
        </div>)}</div>
        {commentDeleteError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{commentDeleteError}</p>}
        {comments.data?.pages[0]?.totalCount === 0 && <p className="text-sm opacity-65">Chưa có bình luận. Hãy viết lời đầu tiên nhé.</p>}
        {comments.data && visibleCommentCount < commentCount && <button type="button" disabled={comments.isFetchingNextPage} onClick={() => void showMoreComments()} className="min-h-8 text-xs font-medium text-[var(--wishes-accent)] underline underline-offset-4 disabled:opacity-50">{comments.isFetchingNextPage ? "Đang tải…" : "Xem thêm bình luận"}</button>}
        {commentSuccess && <p role="status" className="text-xs text-emerald-700">{commentSuccess}</p>}
        <button type="button" onClick={() => { setReplyOpen(open => !open); setCommentError(""); setCommentSuccess(""); }} className="min-h-9 rounded-lg px-3 text-xs font-medium text-[var(--wishes-accent)] transition hover:bg-[var(--wishes-accent)]/5">{replyOpen ? "Đóng khung bình luận" : "Viết bình luận"}</button>
        {replyOpen && <form onSubmit={submitComment} className="grid gap-2 rounded-xl bg-black/[0.025] p-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
            <label className="grid content-start gap-1 text-xs"><span>Tên của bạn</span><input className="min-h-9 rounded-lg border border-[var(--wishes-rule)] bg-white px-3 text-sm outline-none focus:border-[var(--wishes-accent)]" maxLength={100} required disabled={commentBusy} value={commentName} onChange={event => { setCommentName(event.target.value); setCommentError(""); }} placeholder="Tên hiển thị" /></label>
            <label className="grid gap-1 text-xs"><span>Bình luận</span><textarea className="min-h-16 resize-y rounded-lg border border-[var(--wishes-rule)] bg-white px-3 py-2 text-sm leading-5 outline-none focus:border-[var(--wishes-accent)]" maxLength={500} required disabled={commentBusy} value={commentMessage} onChange={event => { setCommentMessage(event.target.value); setCommentError(""); }} placeholder="Viết lời nhắn…" /></label>
          </div>
          <div className="flex items-center justify-between gap-2"><span className="text-[10px] opacity-60">Bình luận sẽ hiển thị công khai.</span><button type="submit" disabled={commentBusy} className="min-h-9 rounded-full px-3 text-xs font-medium text-white disabled:opacity-55" style={{ background: "var(--wishes-accent)" }}>{commentBusy ? "Đang gửi…" : "Gửi bình luận"}</button></div>
          {commentError && <p role="alert" className="text-sm text-red-700">{commentError}</p>}
        </form>}
      </div>}
    </article>
  );
}
