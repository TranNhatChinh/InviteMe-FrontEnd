"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  Menu,
  Music,
  Sparkles,
  Files,
  Undo2,
  Redo2,
  Upload,
  Trash2,
  HandHeart,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useRuntime } from "@/core/config/runtime";
import { BrandLogo } from "@/shared/components/brand-logo";
import { Button } from "@/shared/ui/button";
import { ActionMenu } from "@/shared/ui/action-menu";
import { PreviewMusicPlayer } from "../components/preview-music-player";
import { MusicPanel } from "../editor/music-panel";
import { FallingParticles } from "../components/falling-particles";
import { particleEffects } from "../components/particle-settings";
import {
  giftConfigurationError,
  studioDocumentSchema,
  type ImportedPage,
  type ImportedWidget,
} from "../schemas/document";
import { ImportedWidgetsPanel } from "./widgets-panel";
import type { TemplateStudioProps } from "../editor/studio.types";
import { importPages, MAX_PAGES } from "./import-pages";
import { importedDocument, orderPages, type InvitationDocument } from "./document";
import { Modal } from "@/shared/ui/modal";
import { GiftPreviewContext } from "../components/gift-preview";
import { PreviewViewport } from "../components/preview-viewport";
import { ImportedPages } from "./pages";
import { resolveInvitationDocument } from "../api/design.api";

const uploadedSchema = z.object({
  id: z.string(),
  url: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export function ImportedStudio({
  weddingId,
  ...props
}: TemplateStudioProps & { weddingId: string }) {
  const { t } = useTranslation("invitations", { keyPrefix: "imported" });
  const { api } = useRuntime();
  const router = useRouter();
  const backupKey = props.backup ? `inviteme-import:${props.backup.scope}` : null;
  const [history, setHistory] = useState<{
    past: InvitationDocument[];
    current: InvitationDocument;
    future: InvitationDocument[];
  }>(() => {
    let current = props.initialDocument
      ? studioDocumentSchema.parse(JSON.parse(props.initialDocument))
      : importedDocument([]);
    try {
      const raw =
        backupKey && typeof window !== "undefined" ? localStorage.getItem(backupKey) : null;
      if (raw) {
        const backup = JSON.parse(raw);
        const restored = studioDocumentSchema.parse(backup.document);
        if (backup.base === props.initialDocument && restored.kind === "IMPORTED")
          current = restored;
      }
    } catch {
      /* The server draft remains available if a local backup is invalid. */
    }
    return { past: [], current, future: [] };
  });
  const document = history.current;
  const pages = document.pages ?? [];
  const root = document.nodes.ROOT;
  if (!root) throw new Error("Missing invitation root");
  const settings = root.props;
  const [editing, setEditing] = useState(!!pages.length);
  const [giftWarning, setGiftWarning] = useState("");
  const [preview, setPreview] = useState(props.initialPreview ?? false);
  const [panel, setPanel] = useState<"pages" | "music" | "effects" | "widgets">("pages");
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const widgets = document.widgets ?? [];
  const [mobile, setMobile] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(props.initialDocument ?? "");
  const input = useRef<HTMLInputElement>(null);
  const replacement = useRef<string | null>(null);
  const serialized = JSON.stringify(document);
  const dirty = serialized !== saved;
  useEffect(() => {
    if (!backupKey || !pages.length) return;
    try {
      localStorage.setItem(backupKey, JSON.stringify({ base: props.initialDocument, document }));
    } catch {
      /* Server save remains available when local storage is full. */
    }
  }, [backupKey, document, pages.length, props.initialDocument]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  function change(next: InvitationDocument) {
    setHistory((current) => ({
      past: [...current.past.slice(-29), current.current],
      current: next,
      future: [],
    }));
    setMessage("");
  }
  function setPages(next: ImportedPage[]) {
    change({
      ...document,
      pages: orderPages(next),
      ...(document.widgets
        ? { widgets: widgets.filter((widget) => next.some((page) => page.id === widget.pageId)) }
        : {}),
    });
  }
  function changeWidget(value: ImportedWidget) {
    change({
      ...document,
      widgets: widgets.map((widget) => (widget.id === value.id ? value : widget)),
    });
  }
  function rootProps(patch: Partial<typeof settings>) {
    if (!root) return;
    change({ ...document, nodes: { ROOT: { ...root, props: { ...settings, ...patch } } } });
  }
  function undo() {
    setHistory((h) => {
      const previous = h.past.at(-1);
      return previous
        ? { past: h.past.slice(0, -1), current: previous, future: [h.current, ...h.future] }
        : h;
    });
  }
  function redo() {
    setHistory((h) => {
      const next = h.future[0];
      return next ? { past: [...h.past, h.current], current: next, future: h.future.slice(1) } : h;
    });
  }
  function move(index: number, offset: number) {
    const next = [...pages],
      first = next[index],
      second = next[index + offset];
    if (!first || !second) return;
    next[index] = second;
    next[index + offset] = first;
    setPages(next);
  }
  async function upload(files: File[]) {
    if (lock.current || !files.length) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const replace = replacement.current;
    replacement.current = null;
    const next = [...pages];
    try {
      for (const file of files) {
        const imported = await importPages(file, replace ? 1 : MAX_PAGES - next.length);
        for (const page of imported) {
          if (page.image.size > 5 * 1024 * 1024) throw new Error(t("pageTooLarge"));
          const extension = page.image.type === "image/jpeg" ? "jpg" : "png";
          const body = new FormData();
          body.set(
            "file",
            new File([page.image], `page.${extension}`, { type: page.image.type || "image/png" }),
          );
          const uploaded = await api.request(
            `/weddings/${encodeURIComponent(weddingId)}/media/invitation-pages`,
            {
              method: "POST",
              body,
              schema: uploadedSchema,
            },
          );
          // JPEG may carry an EXIF orientation; use the browser's oriented dimensions.
          const isJpeg = extension === "jpg";
          const item: ImportedPage = {
            id: replace ?? crypto.randomUUID(),
            imageUrl: uploaded.url,
            width: isJpeg ? page.width : uploaded.width,
            height: isJpeg ? page.height : uploaded.height,
            order: next.length,
          };
          if (replace) next[next.findIndex((item) => item.id === replace)] = item;
          else next.push(item);
        }
        if (replace) break;
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : t("uploadFailed"));
    } finally {
      if (JSON.stringify(next) !== JSON.stringify(pages)) setPages(next);
      lock.current = false;
      setBusy(false);
    }
  }
  function showGiftConfiguration() {
    const gift = widgets.find((widget) => widget.type === "GIFT" && widget.enabled);
    if (!gift) return;
    setGiftWarning("");
    setPreview(false);
    setPanel("widgets");
    setSelectedWidget(gift.id);
    requestAnimationFrame(() =>
      globalThis.document
        .querySelector('aside [aria-label="Cấu hình hộp quà mừng"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
  async function persist(publish: boolean) {
    if (lock.current || !pages.length) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const parsed = studioDocumentSchema.parse(document);
      const giftError = giftConfigurationError(parsed);
      if (giftError) {
        setError(giftError);
        setGiftWarning(giftError);
        setPanel("widgets");
        return;
      }
      const value = JSON.stringify(parsed);
      const callback = publish ? props.onPublish : props.onSave;
      if (!callback) return;
      await callback(value);
      setSaved(serialized);
      setMessage(t(publish ? "published" : "saved"));
    } catch (error) {
      setError(error instanceof Error ? error.message : t("saveFailed"));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const iconButton =
    "grid size-8 shrink-0 place-items-center rounded-lg border bg-white disabled:opacity-40";
  const visibleDocument = resolveInvitationDocument(document);
  const toolbar = (
    <header className="flex min-h-[50px] shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-white px-3 py-2">
      <div className="flex items-center gap-3">
        <ActionMenu
          label={t("menu")}
          align="start"
          icon={<Menu size={16} />}
          items={[
            {
              label: t("back"),
              onSelect: () => router.push(props.backHref ?? `/weddings/${weddingId}/invitations`),
            },
            {
              label: t("templates"),
              onSelect: () => router.push(`/weddings/${weddingId}/invitation-templates`),
            },
          ]}
        />
        <BrandLogo size="sm" />
      </div>
      {editing && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground" role="status">
            {busy ? t("processing") : dirty ? t("unsaved") : t("saved")}
          </span>
          <button
            className={iconButton}
            aria-label={t("undo")}
            disabled={busy || !history.past.length}
            onClick={undo}
          >
            <Undo2 size={14} />
          </button>
          <button
            className={iconButton}
            aria-label={t("redo")}
            disabled={busy || !history.future.length}
            onClick={redo}
          >
            <Redo2 size={14} />
          </button>
          <Button
            size="sm"
            variant="outline"
            disabled={!pages.length || busy}
            onClick={() => setPreview(!preview)}
          >
            {t(preview ? "edit" : "preview")}
          </Button>
          <Button
            size="sm"
            disabled={!pages.length || busy || !props.onSave}
            onClick={() => void persist(false)}
          >
            {t("saveDraft")}
          </Button>
          <Button
            size="sm"
            disabled={!pages.length || busy || !props.onPublish}
            onClick={() => void persist(true)}
          >
            {t("publish")}
          </Button>
        </div>
      )}
    </header>
  );
  return (
    <GiftPreviewContext value={props.giftPreview?.(settings.gift)}>
      <Modal
        open={!!giftWarning}
        onClose={() => setGiftWarning("")}
        title="Cần cấu hình hộp quà mừng"
      >
        <p>{giftWarning}</p>
        <Button type="button" className="mt-4" onClick={showGiftConfiguration}>
          Cấu hình ngay
        </Button>
      </Modal>
      <PreviewViewport active={preview} toolbar={toolbar}>
        <main
          className="fixed inset-0 z-40 flex flex-col bg-[#eeeae7]"
          style={{ fontFamily: "Arial, sans-serif" }}
        >
          <FallingParticles effect={settings.particles ?? "none"} />
          {preview && (
            <PreviewMusicPlayer
              value={settings.music}
              resolved={props.resolvedMusic}
              allowLibraryLookup={props.musicLibraryLookup}
            />
          )}
          {!preview && toolbar}
          {busy && !editing && (
            <p role="status" className="bg-white px-5 py-2 text-sm">
              {t("processing")}
            </p>
          )}
          {(error || message) && (
            <p
              role={error ? "alert" : "status"}
              className={`shrink-0 px-5 py-2 text-sm ${error ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}
            >
              {error || message}
            </p>
          )}
          <input
            ref={input}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            multiple
            className="sr-only"
            aria-label={t("upload")}
            onChange={(event) => {
              void upload(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = "";
            }}
          />
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            {!preview && (
              <>
                {editing && (
                  <nav
                    className="flex shrink-0 gap-1 border-b bg-white p-2 md:w-[70px] md:flex-col md:border-b-0 md:border-r"
                    aria-label={t("tools")}
                  >
                    {(
                      [
                        ["pages", Files],
                        ["music", Music],
                        ["effects", Sparkles],
                        ["widgets", HandHeart],
                      ] as const
                    ).map(([id, Icon]) => (
                      <button
                        key={id}
                        className={`flex items-center justify-center gap-1 rounded-xl px-2 py-3 text-[11px] md:flex-col ${panel === id ? "bg-pink-50 text-primary" : "text-muted-foreground"}`}
                        aria-pressed={panel === id}
                        onClick={() => setPanel(id)}
                      >
                        <Icon size={20} />
                        {t(id)}
                      </button>
                    ))}
                  </nav>
                )}
                <aside
                  className="max-h-[40dvh] w-full shrink-0 overflow-auto border-b bg-white p-4 md:max-h-none md:w-[280px] md:border-r"
                  aria-label={t(panel)}
                >
                  {panel === "pages" && (
                    <>
                      <h2 className="mb-3 text-sm font-semibold">
                        {t("pages")} ({pages.length}/{MAX_PAGES})
                      </h2>
                      <button
                        className={`mb-4 w-full rounded-xl border-2 border-dashed p-5 text-center text-xs ${dragging ? "border-primary bg-pink-50" : "border-border"}`}
                        disabled={busy || pages.length >= MAX_PAGES}
                        onClick={() => {
                          replacement.current = null;
                          input.current?.click();
                        }}
                        onDragOver={(event) => {
                          if (!event.dataTransfer.types.includes("Files")) return;
                          event.preventDefault();
                          setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(event) => {
                          event.preventDefault();
                          setDragging(false);
                          replacement.current = null;
                          void upload(Array.from(event.dataTransfer.files));
                        }}
                      >
                        <Upload className="mx-auto mb-2 size-5" />
                        {t("drop")}
                        <span className="mt-2 block leading-5 text-muted-foreground">
                          {t("formats")}
                        </span>
                      </button>
                      <div className="grid gap-3">
                        {pages.map((page, index) => (
                          <div
                            key={page.id}
                            className="rounded-xl border p-2"
                            data-import-page={page.id}
                          >
                            <div className="flex items-center gap-3">
                              <Image
                                src={visibleDocument.pages?.[index]?.imageUrl ?? page.imageUrl}
                                alt=""
                                width={40}
                                height={52}
                                unoptimized
                                className="h-14 w-10 object-contain"
                              />
                              <div className="text-xs">
                                <strong>{t("page", { number: index + 1 })}</strong>
                                <p className="mt-1 text-muted-foreground">
                                  {page.width} × {page.height} px
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 flex gap-2">
                              <button
                                className={iconButton}
                                aria-label={t("up", { number: index + 1 })}
                                disabled={busy || index === 0}
                                onClick={() => move(index, -1)}
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                className={iconButton}
                                aria-label={t("down", { number: index + 1 })}
                                disabled={busy || index === pages.length - 1}
                                onClick={() => move(index, 1)}
                              >
                                <ArrowDown size={14} />
                              </button>
                              <button
                                className="rounded-lg border px-2 text-xs"
                                disabled={busy}
                                onClick={() => {
                                  replacement.current = page.id;
                                  input.current?.click();
                                }}
                              >
                                {t("replace")}
                              </button>
                              <button
                                className={iconButton}
                                aria-label={t("remove", { number: index + 1 })}
                                disabled={busy || pages.length === 1}
                                onClick={() =>
                                  setPages(pages.filter((item) => item.id !== page.id))
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {panel === "music" && (
                    <MusicPanel
                      value={settings.music}
                      resolved={props.resolvedMusic}
                      disabled={busy}
                      onChange={(music) => rootProps({ music })}
                    />
                  )}
                  {panel === "widgets" && (
                    <ImportedWidgetsPanel
                      gift={settings.gift}
                      onGiftChange={(gift) => {
                        rootProps({ gift });
                        setError("");
                      }}
                      giftPanel={props.giftPanel}
                      pages={pages}
                      widgets={widgets}
                      selectedId={selectedWidget}
                      onSelect={setSelectedWidget}
                      onChange={(widgets) => change({ ...document, widgets })}
                      disabled={busy}
                    />
                  )}
                  {panel === "effects" && (
                    <>
                      <h2 className="mb-4 text-sm font-semibold">{t("effects")}</h2>
                      <div className="grid grid-cols-3 gap-3">
                        {particleEffects.map((effect, index) => (
                          <button
                            key={effect}
                            disabled={busy}
                            className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-2 text-xs ${settings.particles === effect ? "border-blue-400 bg-blue-50" : "bg-white"}`}
                            aria-pressed={(settings.particles ?? "none") === effect}
                            onClick={() => rootProps({ particles: effect })}
                          >
                            <span className="text-xl" aria-hidden="true">
                              {["∅", "♥️", "🍃", "囍"][index]}
                            </span>
                            {t(`particle.${effect}`)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {!editing && pages.length > 0 && (
                    <Button
                      className="mt-4 w-full"
                      disabled={busy}
                      onClick={() => setEditing(true)}
                    >
                      {t("continue")}
                    </Button>
                  )}
                </aside>
              </>
            )}
            <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={t("preview")}>
              {!preview && (
                <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b bg-white/90 p-2 text-xs">
                  <button
                    aria-pressed={!mobile}
                    className="rounded border px-3 py-1"
                    onClick={() => setMobile(false)}
                  >
                    Desktop
                  </button>
                  <button
                    aria-pressed={mobile}
                    className="rounded border px-3 py-1"
                    onClick={() => setMobile(true)}
                  >
                    Mobile
                  </button>
                  <label className="flex items-center gap-2">
                    {t("zoom")}
                    <select
                      aria-label={t("zoom")}
                      value={zoom}
                      onChange={(event) => setZoom(Number(event.target.value))}
                    >
                      {[50, 75, 100, 125, 150].map((value) => (
                        <option key={value} value={value}>
                          {value}%
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6" data-imported-scroll>
                {pages.length ? (
                  <div
                    className="mx-auto bg-white shadow-sm"
                    style={{ width: `${zoom}%`, maxWidth: ((mobile ? 390 : 600) * zoom) / 100 }}
                  >
                    <ImportedPages
                      pages={visibleDocument.pages ?? []}
                      bounded={false}
                      widgets={widgets}
                      editable={!preview && !busy}
                      selectedId={selectedWidget}
                      onSelectWidget={(id) => {
                        setSelectedWidget(id);
                        setPanel("widgets");
                      }}
                      onWidgetChange={changeWidget}
                    />
                  </div>
                ) : (
                  <div className="grid min-h-64 place-content-center text-center text-sm text-muted-foreground">
                    {t("empty")}
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>
      </PreviewViewport>
    </GiftPreviewContext>
  );
}
