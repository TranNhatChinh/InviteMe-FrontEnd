"use client";

import { Editor, Element, Frame, useEditor } from "@craftjs/core";
import Moveable from "react-moveable";
import Link from "next/link";
import { useCallback, useContext, useEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Pencil,
  Undo2,
  Redo2,
} from "lucide-react";
import {
  Type,
  ImageIcon,
  Library,
  Shapes,
  Paintbrush,
  Music,
  CalendarDays,
  LayoutTemplate,
  WandSparkles,
  Layers,
  Timer,
  MapPin,
  Phone,
  Bell,
  ClipboardCheck,
  QrCode,
  Mail,
  Images,
  GalleryHorizontal,
  Youtube,
  Sparkles,
} from "lucide-react";
import { StudioFrame, StudioImage, StudioText, type ItemProps } from "../components/items";
import { StudioCalendar, StudioCountdown } from "../components/date-widgets";
import {
  StudioInterview,
  StudioTimeline,
  defaultQuestions,
  defaultMilestones,
} from "../components/story-widgets";
import {
  StudioAlbum,
  StudioMap,
  StudioAction,
  StudioWishes,
} from "../components/invitation-widgets";
import { InvitationCover } from "../components/invitation-cover";
import { TemplateThumbnail } from "../components/template-thumbnail";
import { studioTemplates as templateCatalog, findTemplate } from "../templates/catalog";
import { isValidEventDate } from "../components/date-utils";
import { parseStudioDocument } from "../schemas/document";
import { resolveInvitationDocument } from "../api/design.api";
import { PhotoFocusContext, type PhotoFocus } from "../components/photo-focus";
import styles from "./studio.module.css";
import type { TemplateStudioProps } from "./studio.types";
import { WordingPreviewContext } from "../components/wording-preview";
import { defaultWordingText, resolveCoverGreeting } from "../components/wording-text";
import {
  StudioReveal,
  RevealReplayContext,
  RevealPausedContext,
  type RevealPreset,
} from "../components/reveal";
import { useRuntime } from "@/core/config/runtime";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/i18n/format";
import { useLanguage } from "@/i18n/language-context";

function Workspace({
  initialTemplate = false,
  initialPreview = false,
  initialWording = false,
  wordingPanel,
  backHref,
  initialDocument,
  availableTemplates,
  onSave,
  onUploadImage,
  loadImages,
}: TemplateStudioProps) {
  const { api } = useRuntime();
  const { t } = useTranslation("templateStudio");
  const { language } = useLanguage();
  const {
    actions,
    query,
    selected,
    canUndo,
    canRedo,
    items,
    serialized,
    background,
    revealPreset,
    revealDuration,
  } = useEditor((state, query) => {
    const id = Array.from(state.events.selected)[0];
    return {
      selected: id && id !== "ROOT" ? { id, node: state.nodes[id] } : undefined,
      canUndo: query.history.canUndo(),
      canRedo: query.history.canRedo(),
      items: state.nodes.ROOT?.data.nodes ?? [],
      serialized: query.serialize(),
      revealPreset: state.nodes.ROOT?.data.props.revealPreset ?? "none",
      revealDuration: state.nodes.ROOT?.data.props.revealDuration ?? 800,
      background: (state.nodes.ROOT?.data.props.background as string | undefined) ?? "#fffaf1",
    };
  });
  const { replay } = useContext(RevealReplayContext);
  const [json, setJson] = useState("");
  const [message, setMessage] = useState(() => t("status.initial"));
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState<string | undefined>(() =>
    initialDocument
      ? parseStudioDocument(initialDocument).templateId
      : (findTemplate(initialTemplate)?.id ??
        (typeof initialTemplate === "string" ? initialTemplate : undefined)),
  );
  const [coverOpen, setCoverOpen] = useState(false);
  const [preview, setPreview] = useState(initialPreview);
  const [category, setCategory] = useState(
    initialWording ? "presets" : initialTemplate ? "templates" : "utilities",
  );
  const [wordingPreview, setWordingPreview] = useState<string | null>(null);
  const [uploads, setUploads] = useState<{ src: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replacement, setReplacement] = useState<{
    id: string;
    index: number;
    append: boolean;
  } | null>(null);
  function openImages(append = false) {
    if (!selection) return;
    setReplacement({
      id: selection,
      index: selected?.node?.data.name === "StudioAlbum" ? albumIndex : -1,
      append,
    });
    setCategory("image");
    void (
      loadImages
        ? loadImages()
        : fetch("/api/template-studio/assets").then((response) =>
            response.ok ? response.json() : [],
          )
    )
      .then(setUploads)
      .catch(() => setMessage(t("status.imagesLoadFailed")));
  }
  function chooseImage(src: string) {
    if (!replacement || !query.getNodes()[replacement.id]) return;
    actions.setProp(replacement.id, (value: ItemProps) => {
      if (replacement.index < 0) value.src = src;
      else {
        const images = [
          ...(value.images?.length ? value.images : ["/images/templates/invite-portrait.png"]),
        ];
        if (replacement.append) {
          if (images.length < 100) images.push(src);
        } else images[replacement.index] = src;
        value.images = images;
      }
    });
    setMessage(t(replacement.append ? "status.imageAdded" : "status.imageReplaced"));
  }
  async function uploadImages(files: FileList | File[]) {
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 15)) {
        if (onUploadImage) {
          const uploaded = await onUploadImage(file);
          setUploads((current) => [...current, uploaded]);
        } else {
          const data = new FormData();
          data.append("file", file);
          const response = await fetch("/api/template-studio/assets", {
            method: "POST",
            body: data,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(t("status.imageUploadFailed"));
          setUploads((current) => [...current, { src: result.src, name: file.name }]);
        }
      }
      setMessage(t("status.imageUploaded"));
    } catch {
      setMessage(t("status.imageUploadFailed"));
    } finally {
      setUploading(false);
    }
  }
  const [quickPhotosOpen, setQuickPhotosOpen] = useState(true);
  const { focus: photoFocus, select: selectPhoto } = useContext(PhotoFocusContext);
  const propertyPanel = useRef<HTMLElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const [previewWidth, setPreviewWidth] = useState(480);
  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setPreviewWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const moveable = useRef<Moveable>(null);
  const cover = query.getNodes().ROOT?.data.props.cover as ItemProps["cover"];
  const editingCover = !preview && category === "cover";
  const showingCover = editingCover || (preview && !!cover?.enabled && !coverOpen);
  const props = (selected?.node?.data.props ?? {}) as ItemProps;
  const selection = selected?.id;
  const layerIndex = selection ? items.indexOf(selection) : -1;
  const photoEntries = items.flatMap((id) => {
    const node = query.getNodes()[id];
    if (!node) return [];
    const value = node.data.props as ItemProps;
    const isDecoration = /^\/images\/template-studio\/minimalism-brown\/(?!photo-\d+\.webp$)/.test(
      value.src ?? "",
    );
    const isBurgundyDecoration = /^\/images\/template-studio\/minimalism-burgundy\/.*\.svg$/.test(
      value.src ?? "",
    );
    const isCollectionDecoration = /^\/images\/template-studio\/collection\/(?!photo-)/.test(
      value.src ?? "",
    );
    if (
      node.data.name === "StudioImage" &&
      !isDecoration &&
      !isBurgundyDecoration &&
      !isCollectionDecoration
    ) {
      return [
        {
          nodeId: id,
          index: -1,
          src: value.src ?? "/images/templates/invite-portrait.png",
          label: node.data.displayName,
        },
      ];
    }
    if (node.data.name === "StudioAlbum")
      return (value.images?.length ? value.images : ["/images/templates/invite-portrait.png"]).map(
        (src, index) => ({
          nodeId: id,
          index,
          src,
          label: `${node.data.displayName} · ${index + 1}`,
        }),
      );
    return [];
  });
  const albumImages = props.images?.length
    ? props.images
    : ["/images/templates/invite-portrait.png"];
  const albumIndex = Math.min(
    photoFocus && photoFocus.nodeId === selection ? photoFocus.index : 0,
    albumImages.length - 1,
  );

  function goToPhoto(nodeId: string, index: number) {
    actions.selectNode(nodeId);
    selectPhoto(nodeId, Math.max(0, index));
    const element = Array.from(
      stage.current?.querySelectorAll<HTMLElement>("[data-studio-node]") ?? [],
    ).find((item) => item.dataset.studioNode === nodeId);
    element?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    propertyPanel.current?.scrollTo({ top: 0 });
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (preview || event.defaultPrevented || event.isComposing || event.altKey) return;
      const element = event.target;
      if (
        element instanceof HTMLElement &&
        (element.isContentEditable ||
          element.closest("input, textarea, select, [role='textbox'], [role='dialog']"))
      )
        return;
      const key = event.key.toLowerCase();
      if ((key === "delete" || key === "backspace") && !event.ctrlKey && !event.metaKey) {
        if (selection && query.getNodes()[selection]) {
          event.preventDefault();
          if (!event.repeat) {
            actions.delete(selection);
            setTarget(null);
          }
        }
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const undo = key === "z" && !event.shiftKey;
      const redo = (key === "z" && event.shiftKey) || key === "y";
      if (!undo && !redo) return;
      event.preventDefault();
      if (event.repeat) return;
      if (undo && query.history.canUndo()) actions.history.undo();
      if (redo && query.history.canRedo()) actions.history.redo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions, query, preview, selection]);

  useEffect(() => {
    if (query.getNodes().ROOT) return;
    if (initialDocument) {
      actions.history
        .ignore()
        .deserialize(JSON.stringify(parseStudioDocument(initialDocument).nodes));
      return;
    }
    const template = findTemplate(initialTemplate);
    if (template) {
      actions.history
        .ignore()
        .deserialize(JSON.stringify(parseStudioDocument(JSON.stringify(template.document)).nodes));
      return;
    }
    const initializeBlank = () => {
      if (query.getNodes().ROOT) return;
      const root = (
        <Element is={StudioFrame} canvas>
          <StudioText />
          <StudioImage />
        </Element>
      );
      const tree = query.parseReactElement(root).toNodeTree((node, element) => {
        if (element === root) node.id = "ROOT";
      });
      // Initialize after commit: Frame's JSX initializer mutates the store during render.
      actions.history.ignore().addNodeTree(tree);
    };
    if (typeof initialTemplate === "string") {
      let cancelled = false;
      void api
        .request("/templates", {
          auth: "none",
          schema: z.array(z.object({ slug: z.string(), configurationJson: z.string() })),
        })
        .then((templates) => {
          if (cancelled) return;
          const selectedTemplate = templates.find((item) => item.slug === initialTemplate);
          if (!selectedTemplate) throw new Error("Template is hidden or unavailable.");
          const parsed = resolveInvitationDocument(
            parseStudioDocument(selectedTemplate.configurationJson),
          );
          actions.history.ignore().deserialize(JSON.stringify(parsed.nodes));
          setTemplateId(initialTemplate);
          setMessage(t("status.templateLoaded", { name: initialTemplate }));
        })
        .catch(() => {
          if (cancelled) return;
          setMessage(t("status.templateLoadFailed"));
          initializeBlank();
        });
      return () => {
        cancelled = true;
      };
    }
    initializeBlank();
  }, [actions, api, query, initialTemplate, initialDocument, t]);

  const synchronizeTarget = useCallback(() => {
    const elements = stage.current?.querySelectorAll<HTMLElement>("[data-studio-node]");
    const next =
      Array.from(elements ?? []).find((element) => element.dataset.studioNode === selection) ??
      null;
    setTarget((current) => (current === next ? current : next));
    moveable.current?.updateRect();
  }, [selection]);

  useEffect(() => {
    synchronizeTarget();
  }, [serialized, synchronizeTarget]);

  function update(values: Partial<ItemProps>) {
    const bounds = {
      x: [-3000, 3000],
      y: [-3000, 10000],
      width: [20, 2000],
      height: [20, 10000],
      rotation: [-3600, 3600],
      fontSize: [8, 200],
      opacity: [0, 1],
      lineHeight: [0.8, 3],
      borderRadius: [0, 1000],
    } as const;
    for (const key of Object.keys(bounds) as (keyof typeof bounds)[]) {
      const value = values[key];
      if (value !== undefined)
        values[key] = Math.min(bounds[key][1], Math.max(bounds[key][0], value));
    }
    if (selection)
      actions.setProp(selection, (current: ItemProps) => Object.assign(current, values));
  }
  function add(
    kind:
      | "text"
      | "wording"
      | "image"
      | "calendar"
      | "countdown"
      | "map"
      | "rsvp"
      | "album"
      | "wishes"
      | "reminder"
      | "gift"
      | "interview"
      | "timeline",
    // Story widgets use the same Craft document and placement logic.
  ) {
    if (items.length >= 100) {
      setMessage(t("status.itemLimit"));
      return;
    }
    const component =
      kind === "wording" ? (
        <StudioText
          textBinding="invitationWording"
          text={defaultWordingText}
          fontSize={22}
          height={180}
          width={370}
        />
      ) : kind === "text" ? (
        <StudioText x={65} y={100 + items.length * 18} />
      ) : kind === "image" ? (
        <StudioImage x={70} y={200} width={260} height={300} />
      ) : kind === "calendar" ? (
        <StudioCalendar />
      ) : kind === "countdown" ? (
        <StudioCountdown />
      ) : kind === "map" ? (
        <StudioMap />
      ) : kind === "album" ? (
        <StudioAlbum />
      ) : kind === "wishes" ? (
        <StudioWishes />
      ) : kind === "interview" ? (
        <StudioInterview />
      ) : kind === "timeline" ? (
        <StudioTimeline />
      ) : (
        <StudioAction
          action={kind === "reminder" ? "calendar" : kind === "gift" ? "gift" : "rsvp"}
          title={
            kind === "reminder"
              ? "Thêm vào lịch"
              : kind === "gift"
                ? "Hộp quà mừng"
                : "XÁC NHẬN THAM DỰ"
          }
        />
      );
    const node = query.parseReactElement(component).toNodeTree();
    const newItem = node.nodes[node.rootNodeId];
    const frame = stage.current?.querySelector<HTMLElement>("[data-studio-frame]");
    const viewport = stage.current?.parentElement;
    if (newItem && frame && viewport) {
      const frameProps = query.getNodes().ROOT?.data.props;
      const frameWidth = Number(frameProps?.width ?? 480);
      const frameHeight = Number(frameProps?.height ?? 760);
      const frameRect = frame.getBoundingClientRect();
      const viewRect = viewport.getBoundingClientRect();
      const scale = frameRect.width / frameWidth || 1;
      const visibleTop = Math.max(0, (viewRect.top - frameRect.top) / scale + 16);
      const visibleHeight = Math.min(viewport.clientHeight / scale - 32, frameHeight - visibleTop);
      const width = Math.min(Number(newItem.data.props.width ?? 220), frameWidth - 40);
      const height = Number(newItem.data.props.height ?? 70);
      Object.assign(newItem.data.props, {
        width,
        x: Math.max(0, (frameWidth - width) / 2),
        y: Math.max(
          20,
          Math.min(
            frameHeight - height - 20,
            visibleTop + Math.max(0, (visibleHeight - height) / 2),
          ),
        ),
      });
    }
    actions.addNodeTree(node, "ROOT");
    actions.selectNode(node.rootNodeId);
    setMessage(t("status.itemAdded"));
  }
  function moveLayer(direction: "up" | "down") {
    if (!selection || layerIndex < 0) return;
    if (direction === "up" && layerIndex < items.length - 1) {
      // Craft inserts before removing the old position, so forward moves skip that slot.
      actions.move(selection, "ROOT", layerIndex + 2);
    } else if (direction === "down" && layerIndex > 0) {
      actions.move(selection, "ROOT", layerIndex - 1);
    }
  }
  function exportJson() {
    const value = JSON.stringify(
      { schemaVersion: 1, templateId, nodes: JSON.parse(query.serialize()) },
      null,
      2,
    );
    setJson(value);
    setMessage(t("status.jsonExported"));
    return value;
  }
  async function saveDesign() {
    if (!onSave || saving) return;
    setSaving(true);
    try {
      const doc = parseStudioDocument(
        JSON.stringify({ schemaVersion: 1, templateId, nodes: JSON.parse(query.serialize()) }),
      );
      await onSave(JSON.stringify(doc));
      setMessage(t("status.draftSaved"));
    } catch {
      setMessage(t("status.saveFailed"));
    } finally {
      setSaving(false);
    }
  }
  function importJson(value: string) {
    try {
      const document = parseStudioDocument(value);
      setTemplateId(document.templateId);
      actions.deserialize(JSON.stringify(document.nodes));
      actions.selectNode();
      setJson(value);
      setMessage(t("status.jsonOpened"));
    } catch {
      setMessage(t("status.jsonOpenFailed"));
    }
  }

  return (
    <WordingPreviewContext value={wordingPreview}>
      <main
        id="main-content"
        className={styles.studio}
        data-preview={preview}
        data-cover-editor={editingCover}
        style={
          {
            "--photo-dock-height":
              preview || editingCover ? "0px" : quickPhotosOpen ? "128px" : "36px",
          } as CSSProperties
        }
      >
        {!preview && (
          <>
            <header className={styles.header}>
              <h1>{t("header.title")}</h1>
              <p className={styles.status} role="status">
                {message}
              </p>
              <div className={styles.buttons}>
                {backHref && (
                  <Link href={backHref} className={styles.backLink}>
                    {t("header.backWedding")}
                  </Link>
                )}
                {onSave && (
                  <button
                    className={styles.saveButton}
                    disabled={saving}
                    onClick={() => void saveDesign()}
                  >
                    {saving ? t("header.saving") : t("header.saveDraft")}
                  </button>
                )}
                <button
                  className={styles.historyButton}
                  aria-label={t("header.undo")}
                  title={`${t("header.undo")} · Ctrl+Z`}
                  aria-keyshortcuts="Control+Z Meta+Z"
                  disabled={!canUndo}
                  onClick={() => actions.history.undo()}
                >
                  <Undo2 size={18} aria-hidden="true" />
                </button>
                <button
                  className={styles.historyButton}
                  aria-label={t("header.redo")}
                  title={`${t("header.redo")} · Ctrl+Shift+Z / Ctrl+Y`}
                  aria-keyshortcuts="Control+Shift+Z Control+Y Meta+Shift+Z"
                  disabled={!canRedo}
                  onClick={() => actions.history.redo()}
                >
                  <Redo2 size={18} aria-hidden="true" />
                </button>
                <button
                  onClick={() => {
                    actions.selectNode();
                    actions.setOptions((options) => {
                      options.enabled = preview;
                    });
                    if (!preview) replay();
                    setCoverOpen(false);
                    stage.current?.parentElement?.scrollTo({ top: 0 });
                    setPreview(!preview);
                  }}
                >
                  {preview ? t("header.backEditor") : t("header.preview")}
                </button>
              </div>
            </header>
          </>
        )}
        {preview && (
          <button
            className={styles.demoEdit}
            onClick={() => {
              actions.setOptions((options) => {
                options.enabled = true;
              });
              setCoverOpen(false);
              setPreview(false);
            }}
          >
            <Pencil size={15} aria-hidden="true" /> {t("header.edit")}
          </button>
        )}
        <div className={styles.layout}>
          <aside className={styles.library} aria-label={t("categories.libraryAria")}>
            <nav className={styles.rail} aria-label={t("categories.navAria")}>
              {[
                { id: "cover", icon: Mail },
                { id: "text", icon: Type },
                { id: "image", icon: ImageIcon },
                { id: "stock", icon: Library },
                { id: "shapes", icon: Shapes },
                { id: "background", icon: Paintbrush },
                { id: "music", icon: Music },
                { id: "utilities", icon: CalendarDays },
                { id: "presets", icon: Mail },
                { id: "templates", icon: LayoutTemplate },
                { id: "effects", icon: WandSparkles },
                { id: "layers", icon: Layers },
              ].map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  aria-pressed={category === id}
                  onClick={() => {
                    actions.selectNode();
                    setTarget(null);
                    setCategory(id);
                    workspace.current?.scrollTo({ top: 0 });
                  }}
                >
                  <Icon size={22} />
                  <span>{t(`categories.${id}`)}</span>
                </button>
              ))}
            </nav>
            <div className={styles.libraryContent}>
              {category === "utilities" && (
                <>
                  <h2>{t("categories.utilities")}</h2>
                  <p>{t("library.utilitiesHelp")}</p>
                  <div className={styles.utilityGrid}>
                    {[
                      { key: "calendar", icon: CalendarDays, kind: "calendar" as const },
                      { key: "countdown", icon: Timer, kind: "countdown" as const },
                      { key: "map", icon: MapPin, kind: "map" as const },
                      { key: "call", icon: Phone },
                      { key: "reminder", icon: Bell, kind: "reminder" as const },
                      {
                        key: "rsvp",
                        icon: ClipboardCheck,
                        kind: "rsvp" as const,
                      },
                      { key: "customForm", icon: ClipboardCheck },
                      { key: "guestName", icon: Type },
                      { key: "qr", icon: QrCode },
                      { key: "envelope", icon: Mail },
                      { key: "album", icon: Images, kind: "album" as const },
                      { key: "wishes", icon: ClipboardCheck, kind: "wishes" as const },
                      { key: "interview", icon: ClipboardCheck, kind: "interview" as const },
                      { key: "timeline", icon: Timer, kind: "timeline" as const },
                      { key: "gift", icon: Mail, kind: "gift" as const },
                      { key: "carousel", icon: GalleryHorizontal },
                      { key: "youtube", icon: Youtube },
                      { key: "particles", icon: Sparkles },
                    ].map(({ key, icon: Icon, ...item }) => {
                      const kind = "kind" in item ? item.kind : undefined;
                      return (
                        <button
                          key={key}
                          disabled={preview || !kind}
                          onClick={() => {
                            if (kind) add(kind);
                          }}
                        >
                          <Icon size={32} />
                          <span>{t(`utilities.${key}`)}</span>
                          {!kind && <small>{t("utilities.comingSoon")}</small>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {category === "text" && (
                <>
                  <h2>{t("categories.text")}</h2>
                  <p>{t("library.textHelp")}</p>
                  <button className={styles.addCard} disabled={preview} onClick={() => add("text")}>
                    <Type size={30} />
                    {t("library.addText")}
                  </button>
                </>
              )}
              {category === "image" && (
                <>
                  <h2>{t("categories.image")}</h2>
                  <label
                    className={styles.uploadBox}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!uploading) void uploadImages(event.dataTransfer.files);
                    }}
                  >
                    <ImageIcon size={36} />
                    <strong>
                      {uploading ? t("library.loadingImage") : t("library.uploadImage")}
                    </strong>
                    <small>{t("library.imageLimits")}</small>
                    <input
                      aria-label={t("library.uploadAria")}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      disabled={uploading}
                      onChange={(event) => {
                        if (event.target.files) void uploadImages(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <p>
                    {replacement
                      ? replacement.append
                        ? t("library.chooseAlbumImage")
                        : t("library.chooseReplacement")
                      : t("library.selectCanvasImage")}
                  </p>
                  <h3>
                    {t("library.uploadedFiles", { count: formatNumber(uploads.length, language) })}
                  </h3>
                  <div className={styles.uploadGrid}>
                    {uploads.map((image) => (
                      <button key={image.src} onClick={() => chooseImage(image.src)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.src} alt={image.name} />
                      </button>
                    ))}
                  </div>
                  <button
                    className={styles.addCard}
                    disabled={preview}
                    onClick={() => add("image")}
                  >
                    {t("library.addImageItem")}
                  </button>
                </>
              )}
              {category === "layers" && (
                <>
                  <h2>{t("categories.layers")}</h2>
                  <p>{t("library.layersHelp")}</p>
                  {[...items].reverse().map((id) => (
                    <button
                      key={id}
                      disabled={preview}
                      className={styles.layer}
                      aria-pressed={id === selection}
                      onClick={() => actions.selectNode(id)}
                    >
                      {query.node(id).get().data.displayName}
                    </button>
                  ))}
                </>
              )}
              {category === "background" && (
                <>
                  <h2>{t("library.designBackground")}</h2>
                  <ColorControl
                    key={`background-${background}`}
                    label={t("library.frameBackground")}
                    value={background}
                    disabled={preview}
                    onChange={(color) =>
                      actions.setProp("ROOT", (value) => {
                        value.background = color;
                      })
                    }
                  />
                </>
              )}
              {category === "templates" && (
                <>
                  <h2>
                    {t("library.templatesCount", {
                      count: formatNumber((availableTemplates ?? templateCatalog).length, language),
                    })}
                  </h2>
                  <p>{t("library.templateHelp")}</p>
                  {(availableTemplates ?? templateCatalog).map((template) => (
                    <div className={styles.templateCard} key={template.id}>
                      <TemplateThumbnail document={template.document} />
                      <h3>{template.name}</h3>
                      <p>{template.description}</p>
                      <button
                        disabled={preview}
                        onClick={() => {
                          if (
                            canUndo &&
                            !window.confirm(
                              "Bạn có thay đổi chưa lưu. Bạn có chắc chắn muốn đổi mẫu và hủy các thay đổi này không?",
                            )
                          ) {
                            return;
                          }
                          importJson(
                            JSON.stringify({ ...template.document, templateId: template.id }),
                          );
                          setCoverOpen(false);
                          setMessage(t("status.templateApplied", { name: template.name }));
                          stage.current?.parentElement?.scrollTo({ top: 0 });
                        }}
                      >
                        {t("library.useTemplate", { name: template.name.replace(" · ", " ") })}
                      </button>
                    </div>
                  ))}
                </>
              )}
              {category === "cover" && (
                <fieldset className={styles.coverControls} disabled={preview}>
                  <h2>{t("library.cover")}</h2>
                  <p>{t("library.coverHelp")}</p>
                  <label>
                    <input
                      type="checkbox"
                      checked={cover?.enabled ?? false}
                      onChange={(event) =>
                        actions.setProp("ROOT", (value: ItemProps) => {
                          value.cover = {
                            names: "Minh Quân\n& An Nhiên",
                            date: "3 tháng 1, 2026",
                            background: "#681f30",
                            ...value.cover,
                            enabled: event.target.checked,
                          };
                        })
                      }
                    />{" "}
                    {t("library.useCover")}
                  </label>
                  {cover?.enabled && (
                    <>
                      <ColorControl
                        label={t("library.coverBackground")}
                        value={cover.background}
                        onChange={(background) =>
                          actions.setProp("ROOT", (value: ItemProps) => {
                            if (value.cover) value.cover.background = background;
                          })
                        }
                      />
                      <label>
                        {t("library.coverNames")}
                        <textarea
                          value={cover.names}
                          onChange={(event) =>
                            actions.setProp("ROOT", (value: ItemProps) => {
                              if (value.cover) value.cover.names = event.target.value.slice(0, 150);
                            })
                          }
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={cover.greetingBinding === "invitationWording"}
                          onChange={(event) =>
                            actions.setProp("ROOT", (value: ItemProps) => {
                              if (value.cover)
                                value.cover.greetingBinding = event.target.checked
                                  ? "invitationWording"
                                  : undefined;
                            })
                          }
                        />
                        {t("library.personalizedWording")}
                      </label>
                      {cover.greetingBinding && (
                        <>
                          <p>{t("library.wordingBindingHelp")}</p>
                        </>
                      )}
                      <label>
                        {t("library.coverGreeting")}
                        <textarea
                          maxLength={300}
                          readOnly={!!cover.greetingBinding}
                          aria-label={t("library.coverGreetingAria")}
                          value={resolveCoverGreeting(cover, wordingPreview)}
                          placeholder={t("library.coverGreetingPlaceholder")}
                          onChange={(event) =>
                            actions.setProp("ROOT", (value: ItemProps) => {
                              if (value.cover) value.cover.greeting = event.target.value;
                            })
                          }
                        />
                      </label>
                      <label>
                        {t("library.coverStyle")}
                        <select
                          value={cover.style ?? "floral"}
                          onChange={(event) =>
                            actions.setProp("ROOT", (value: ItemProps) => {
                              if (value.cover)
                                value.cover.style = event.target.value as NonNullable<
                                  ItemProps["cover"]
                                >["style"];
                            })
                          }
                        >
                          <option value="floral">{t("library.coverFloral")}</option>
                          <option value="traditional">{t("library.coverTraditional")}</option>
                          <option value="botanical">{t("library.coverBotanical")}</option>
                        </select>
                      </label>
                      <label>
                        {t("library.backgroundEffect")}
                        <select
                          value={cover.particles ?? "hearts"}
                          onChange={(event) =>
                            actions.setProp("ROOT", (value: ItemProps) => {
                              if (value.cover)
                                value.cover.particles = event.target.value as NonNullable<
                                  ItemProps["cover"]
                                >["particles"];
                            })
                          }
                        >
                          <option value="none">{t("library.none")}</option>
                          <option value="hearts">{t("library.hearts")}</option>
                          <option value="leaves">{t("library.leaves")}</option>
                          <option value="happiness">{t("library.happiness")}</option>
                        </select>
                      </label>
                      <label>
                        {t("library.openingAnimation")}
                        <select
                          value={cover.opening ?? "seal"}
                          onChange={(event) =>
                            actions.setProp("ROOT", (value: ItemProps) => {
                              if (value.cover)
                                value.cover.opening = event.target.value as NonNullable<
                                  ItemProps["cover"]
                                >["opening"];
                            })
                          }
                        >
                          <option value="seal">{t("library.sealOpening")}</option>
                          <option value="fly">{t("library.flyOpening")}</option>
                          <option value="fade">{t("library.fadeOpening")}</option>
                        </select>
                      </label>
                      <label>
                        {t("library.coverDate")}
                        <input
                          value={cover.date}
                          onChange={(event) =>
                            actions.setProp("ROOT", (value: ItemProps) => {
                              if (value.cover) value.cover.date = event.target.value.slice(0, 100);
                            })
                          }
                        />
                      </label>
                      <button
                        onClick={() => {
                          setCoverOpen(false);
                          actions.selectNode();
                          actions.setOptions((options) => {
                            options.enabled = false;
                          });
                          stage.current?.parentElement?.scrollTo({ top: 0 });
                          setPreview(true);
                        }}
                      >
                        {t("library.previewCover")}
                      </button>
                    </>
                  )}
                </fieldset>
              )}
              <div
                hidden={
                  category !== "presets" &&
                  !(category === "cover" && cover?.enabled && cover.greetingBinding)
                }
                className={styles.wordingPanel}
                role="region"
                aria-label={t("library.wordingConfigAria")}
              >
                <h2>{t("library.personalizedInvitation")}</h2>
                {category === "presets" && (
                  <>
                    <button
                      className={styles.wordingInsert}
                      disabled={preview}
                      onClick={() => add("wording")}
                    >
                      {t("library.addWordingBlock")}
                    </button>
                    <p>{t("library.wordingBlockHelp")}</p>
                  </>
                )}
                {wordingPanel ? (
                  wordingPanel({ onPreview: setWordingPreview })
                ) : (
                  <p>
                    {t("library.openFromWedding")}{" "}
                    <Link href="/weddings">{t("library.weddingList")}</Link>
                  </p>
                )}
              </div>
              {category === "effects" && (
                <>
                  <h2>{t("library.wholePageEffects")}</h2>
                  <p>{t("library.wholePageEffectsHelp")}</p>
                  <div className={styles.uploadGrid}>
                    {(
                      [
                        ["none", "None"],
                        ["fade", "Fade In All"],
                        ["slide-up", "Slide Up All"],
                        ["scale-in", "Scale In All"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        disabled={preview}
                        aria-pressed={revealPreset === value}
                        onClick={() => {
                          actions.setProp("ROOT", (props: ItemProps) => {
                            props.revealPreset = value;
                          });
                          replay();
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label>
                    {t("library.effectDuration")}
                    <input
                      type="number"
                      min={100}
                      max={3000}
                      disabled={preview}
                      value={revealDuration}
                      onChange={(event) =>
                        actions.setProp("ROOT", (props: ItemProps) => {
                          props.revealDuration = Math.max(
                            100,
                            Math.min(3000, Number(event.target.value)),
                          );
                        })
                      }
                    />
                  </label>
                  <p>{t("library.effectHelp")}</p>
                </>
              )}
              {["stock", "shapes", "music"].includes(category) && (
                <>
                  <h2>
                    {
                      (
                        {
                          stock: t("categories.stock"),
                          shapes: t("categories.shapes"),
                          music: t("categories.music"),
                          presets: t("categories.presets"),
                          templates: t("categories.templates"),
                          effects: t("categories.effects"),
                        } as Record<string, string>
                      )[category]
                    }
                  </h2>
                  <p>{t("library.contentComingSoon")}</p>
                </>
              )}
            </div>
          </aside>
          <section
            ref={workspace}
            className={styles.workspace}
            aria-label={t("library.workspaceAria")}
          >
            <RevealPausedContext.Provider value={showingCover}>
              <div
                ref={stage}
                style={{
                  display: showingCover ? "none" : undefined,
                  zoom: preview
                    ? Math.min(
                        1,
                        Math.max(
                          0.2,
                          previewWidth / (query.getNodes().ROOT?.data.props.width ?? 480),
                        ),
                      )
                    : 1,
                }}
                onClick={synchronizeTarget}
                onPointerUp={synchronizeTarget}
              >
                <Frame />
              </div>
            </RevealPausedContext.Provider>
            {showingCover && (
              <InvitationCover
                key={editingCover ? "cover-editor" : "cover-preview"}
                editing={editingCover}
                config={
                  cover ?? {
                    enabled: false,
                    names: "Minh Quân\n& An Nhiên",
                    date: "3 tháng 1, 2026",
                    background: "#681f30",
                  }
                }
                onOpen={() => {
                  setCoverOpen(true);
                  stage.current?.parentElement?.scrollTo({ top: 0 });
                }}
              />
            )}
            {!preview && !editingCover && (
              <Moveable
                ref={moveable}
                target={target}
                draggable
                resizable
                rotatable
                checkInput
                origin={false}
                flushSync={flushSync}
                onDragStart={(event) => event.set([props.x ?? 0, props.y ?? 0])}
                onDrag={(event) => {
                  event.target.style.left = `${event.beforeTranslate[0]}px`;
                  event.target.style.top = `${event.beforeTranslate[1]}px`;
                }}
                onDragEnd={(event) => {
                  if (event.lastEvent)
                    update({
                      x: event.lastEvent.beforeTranslate[0],
                      y: event.lastEvent.beforeTranslate[1],
                    });
                }}
                onResizeStart={(event) => {
                  event.setOrigin(["%", "%"]);
                  if (event.dragStart) event.dragStart.set([props.x ?? 0, props.y ?? 0]);
                }}
                onResize={(event) => {
                  Object.assign(event.target.style, {
                    width: `${event.width}px`,
                    height: `${event.height}px`,
                    left: `${event.drag.beforeTranslate[0]}px`,
                    top: `${event.drag.beforeTranslate[1]}px`,
                  });
                }}
                onResizeEnd={(event) => {
                  if (event.lastEvent)
                    update({
                      width: Math.max(20, event.lastEvent.width),
                      height: Math.max(20, event.lastEvent.height),
                      x: event.lastEvent.drag.beforeTranslate[0],
                      y: event.lastEvent.drag.beforeTranslate[1],
                    });
                }}
                onRotateStart={(event) => event.set(props.rotation ?? 0)}
                onRotate={(event) => {
                  event.target.style.transform = `rotate(${event.beforeRotate}deg)`;
                }}
                onRotateEnd={(event) => {
                  if (event.lastEvent) update({ rotation: event.lastEvent.beforeRotate });
                }}
              />
            )}
          </section>
          <aside ref={propertyPanel} className={styles.panel} hidden={editingCover}>
            <h2>{t("properties.title")}</h2>
            {!selection ? (
              <p>{t("properties.selectItem")}</p>
            ) : (
              <fieldset disabled={preview}>
                <div className={styles.layerControls}>
                  <button
                    title={t("properties.deleteTitle")}
                    aria-keyshortcuts="Delete Backspace"
                    className={styles.deleteButton}
                    onClick={() => {
                      actions.delete(selection);
                      setTarget(null);
                    }}
                  >
                    {t("properties.delete")}
                  </button>
                  <span>
                    {t("properties.layerOrder", {
                      current: formatNumber(layerIndex + 1, language),
                      total: formatNumber(items.length, language),
                    })}
                  </span>
                  <div className={styles.buttons}>
                    <button
                      disabled={layerIndex >= items.length - 1}
                      onClick={() => moveLayer("up")}
                    >
                      {t("properties.moveUp")}
                    </button>
                    <button disabled={layerIndex <= 0} onClick={() => moveLayer("down")}>
                      {t("properties.moveDown")}
                    </button>
                  </div>
                </div>
                <label>
                  {t("properties.itemEffect")}
                  <select
                    value={props.revealPreset ?? "inherit"}
                    onChange={(event) => {
                      if (selection)
                        actions.setProp(selection, (value: ItemProps) => {
                          if (event.target.value === "inherit") delete value.revealPreset;
                          else value.revealPreset = event.target.value as RevealPreset;
                        });
                    }}
                  >
                    <option value="inherit">{t("properties.inheritEffect")}</option>
                    <option value="none">{t("properties.noEffect")}</option>
                    <option value="fade">{t("properties.fadeIn")}</option>
                    <option value="slide-up">{t("properties.slideUp")}</option>
                    <option value="scale-in">{t("properties.scaleIn")}</option>
                  </select>
                </label>
                <label>
                  {t("properties.effectDelay")}
                  <input
                    type="number"
                    min={0}
                    max={3000}
                    value={props.revealDelay ?? 0}
                    onChange={(event) =>
                      update({
                        revealDelay: Math.max(0, Math.min(3000, Number(event.target.value))),
                      })
                    }
                  />
                </label>
                {selected?.node?.data.name === "StudioAlbum" && (
                  <>
                    <h2>
                      {t("properties.albumImageCount", {
                        current: formatNumber(albumIndex + 1, language),
                        total: formatNumber(albumImages.length, language),
                      })}
                    </h2>
                    <div className={styles.albumSlots}>
                      {albumImages.map((src, index) => (
                        <button
                          key={index}
                          aria-label={t("properties.selectAlbumImage", {
                            number: formatNumber(index + 1, language),
                          })}
                          aria-pressed={albumIndex === index}
                          onClick={() => selectPhoto(selection, index)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={src}
                            alt={t("properties.albumImageAlt", {
                              number: formatNumber(index + 1, language),
                            })}
                          />
                          <span>{index + 1}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => openImages()}>
                      {t("properties.replaceSelectedImage")}
                    </button>
                    <button disabled={albumImages.length >= 100} onClick={() => openImages(true)}>
                      {t("properties.addAlbumImage")}
                    </button>
                    <button
                      disabled={albumImages.length <= 1}
                      onClick={() => {
                        update({ images: albumImages.filter((_, index) => index !== albumIndex) });
                        selectPhoto(selection, Math.max(0, albumIndex - 1));
                      }}
                    >
                      {t("properties.removeSelectedImage")}
                    </button>
                  </>
                )}
                {selected?.node?.data.name === "StudioImage" && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className={styles.imagePreview}
                      src={props.src ?? "/images/templates/invite-portrait.png"}
                      alt={t("properties.selectedImageAlt")}
                    />
                    <button onClick={() => openImages()}>{t("properties.replaceImage")}</button>
                    <label>
                      {t("properties.imageDisplay")}
                      <select
                        value={props.objectFit ?? "cover"}
                        onChange={(event) =>
                          update({ objectFit: event.target.value as ItemProps["objectFit"] })
                        }
                      >
                        <option value="cover">{t("properties.coverCrop")}</option>
                        <option value="contain">{t("properties.containImage")}</option>
                      </select>
                    </label>
                    <label>
                      {t("properties.cornerRadius")}
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={props.borderRadius ?? 0}
                        onChange={(event) => update({ borderRadius: Number(event.target.value) })}
                      />
                    </label>
                  </>
                )}
                {[
                  "StudioMap",
                  "StudioAction",
                  "StudioAlbum",
                  "StudioWishes",
                  "StudioInterview",
                  "StudioTimeline",
                ].includes(selected?.node?.data.name ?? "") && (
                  <>
                    <label>
                      {t("properties.widgetTitle")}
                      <input
                        maxLength={150}
                        value={props.title ?? ""}
                        onChange={(event) => update({ title: event.target.value })}
                      />
                    </label>
                    {selected?.node?.data.name === "StudioInterview" && (
                      <>
                        {(props.questions ?? defaultQuestions).map((entry, index, entries) => (
                          <fieldset key={index}>
                            <legend>
                              {t("properties.questionNumber", {
                                number: formatNumber(index + 1, language),
                              })}
                            </legend>
                            <label>
                              {t("properties.question")}
                              <input
                                maxLength={150}
                                value={entry.question}
                                onChange={(event) =>
                                  update({
                                    questions: entries.map((item, i) =>
                                      i === index
                                        ? { ...item, question: event.target.value }
                                        : item,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              {t("properties.answer")}
                              <textarea
                                maxLength={600}
                                value={entry.answer}
                                onChange={(event) =>
                                  update({
                                    questions: entries.map((item, i) =>
                                      i === index ? { ...item, answer: event.target.value } : item,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <button
                              disabled={index === 0}
                              onClick={() => {
                                const next = entries.filter((_, i) => i !== index);
                                next.splice(index - 1, 0, entry);
                                update({ questions: next });
                              }}
                            >
                              {t("properties.moveEarlier")}
                            </button>
                            <button
                              disabled={entries.length < 2}
                              onClick={() =>
                                update({ questions: entries.filter((_, i) => i !== index) })
                              }
                            >
                              {t("properties.removeQuestion")}
                            </button>
                          </fieldset>
                        ))}
                        <button
                          disabled={(props.questions ?? defaultQuestions).length >= 8}
                          onClick={() =>
                            update({
                              questions: [
                                ...(props.questions ?? defaultQuestions),
                                { question: "Câu hỏi mới", answer: "Viết câu trả lời của bạn." },
                              ],
                            })
                          }
                        >
                          {t("properties.addQuestion")}
                        </button>
                      </>
                    )}
                    {selected?.node?.data.name === "StudioTimeline" && (
                      <>
                        {(props.milestones ?? defaultMilestones).map((entry, index, entries) => (
                          <fieldset key={index}>
                            <legend>
                              {t("properties.milestoneNumber", {
                                number: formatNumber(index + 1, language),
                              })}
                            </legend>
                            <label>
                              {t("properties.time")}
                              <input
                                maxLength={40}
                                value={entry.time}
                                onChange={(event) =>
                                  update({
                                    milestones: entries.map((item, i) =>
                                      i === index ? { ...item, time: event.target.value } : item,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              {t("properties.milestoneTitle")}
                              <input
                                maxLength={120}
                                value={entry.title}
                                onChange={(event) =>
                                  update({
                                    milestones: entries.map((item, i) =>
                                      i === index ? { ...item, title: event.target.value } : item,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              {t("properties.description")}
                              <textarea
                                maxLength={220}
                                value={entry.description}
                                onChange={(event) =>
                                  update({
                                    milestones: entries.map((item, i) =>
                                      i === index
                                        ? { ...item, description: event.target.value }
                                        : item,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <button
                              disabled={index === 0}
                              onClick={() => {
                                const next = entries.filter((_, i) => i !== index);
                                next.splice(index - 1, 0, entry);
                                update({ milestones: next });
                              }}
                            >
                              {t("properties.moveEarlier")}
                            </button>
                            <button
                              disabled={entries.length < 2}
                              onClick={() =>
                                update({ milestones: entries.filter((_, i) => i !== index) })
                              }
                            >
                              {t("properties.removeMilestone")}
                            </button>
                          </fieldset>
                        ))}
                        <button
                          disabled={(props.milestones ?? defaultMilestones).length >= 8}
                          onClick={() =>
                            update({
                              milestones: [
                                ...(props.milestones ?? defaultMilestones),
                                {
                                  time: "19:00",
                                  title: "Mốc mới",
                                  description: "Nội dung của bạn.",
                                },
                              ],
                            })
                          }
                        >
                          {t("properties.addMilestone")}
                        </button>
                      </>
                    )}
                    {selected?.node?.data.name === "StudioMap" && (
                      <label>
                        {t("properties.location")}
                        <textarea
                          maxLength={500}
                          value={props.address ?? ""}
                          onChange={(event) => update({ address: event.target.value })}
                        />
                      </label>
                    )}
                    {selected?.node?.data.name === "StudioAction" && (
                      <>
                        <label>
                          {t("properties.action")}
                          <select
                            value={props.action ?? "rsvp"}
                            onChange={(event) =>
                              update({ action: event.target.value as ItemProps["action"] })
                            }
                          >
                            <option value="rsvp">{t("properties.rsvp")}</option>
                            <option value="calendar">{t("properties.addToCalendar")}</option>
                            <option value="gift">{t("properties.giftBox")}</option>
                          </select>
                        </label>
                        <label>
                          {t("properties.content")}
                          <textarea
                            maxLength={2000}
                            value={props.message ?? ""}
                            onChange={(event) => update({ message: event.target.value })}
                          />
                        </label>
                        {props.action === "calendar" && (
                          <>
                            <label>
                              {t("properties.eventDate")}
                              <input
                                type="date"
                                value={props.eventDate ?? "2027-01-03"}
                                onChange={(event) => {
                                  if (isValidEventDate(event.target.value))
                                    update({ eventDate: event.target.value });
                                }}
                              />
                            </label>
                            <label>
                              {t("properties.eventTime")}
                              <input
                                type="time"
                                value={props.eventTime ?? "18:00"}
                                onChange={(event) => {
                                  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(event.target.value))
                                    update({ eventTime: event.target.value });
                                }}
                              />
                            </label>
                          </>
                        )}
                      </>
                    )}
                    <ColorControl
                      key={`${selection}-widget-bg-${props.background}`}
                      label={t("properties.utilityBackground")}
                      value={props.background ?? "#faf4ec"}
                      onChange={(background) => update({ background })}
                    />
                    <ColorControl
                      key={`${selection}-widget-accent-${props.accent}`}
                      label={t("properties.accentColor")}
                      value={props.accent ?? "#7c6a60"}
                      onChange={(accent) => update({ accent })}
                    />
                  </>
                )}
                {(selected?.node?.data.name === "StudioCalendar" ||
                  selected?.node?.data.name === "StudioCountdown") && (
                  <>
                    <label>
                      {t("properties.title")}
                      <input
                        maxLength={150}
                        value={props.title ?? ""}
                        onChange={(event) => update({ title: event.target.value })}
                      />
                    </label>
                    <label>
                      {t("properties.eventDate")}
                      <input
                        type="date"
                        value={props.eventDate ?? "2027-04-18"}
                        onChange={(event) => {
                          if (isValidEventDate(event.target.value))
                            update({ eventDate: event.target.value });
                        }}
                      />
                    </label>
                    {selected.node.data.name === "StudioCountdown" && (
                      <>
                        <label>
                          {t("properties.eventTime")}
                          <input
                            type="time"
                            value={props.eventTime ?? "17:00"}
                            onChange={(event) => {
                              if (/^([01]\d|2[0-3]):[0-5]\d$/.test(event.target.value))
                                update({ eventTime: event.target.value });
                            }}
                          />
                        </label>
                        <label>
                          {t("properties.timezone")}
                          <select
                            value={props.timezone ?? "Asia/Ho_Chi_Minh"}
                            onChange={(event) =>
                              update({ timezone: event.target.value as ItemProps["timezone"] })
                            }
                          >
                            <option value="Asia/Ho_Chi_Minh">
                              {t("properties.vietnamTimezone")}
                            </option>
                            <option value="UTC">UTC (GMT+0)</option>
                          </select>
                        </label>
                      </>
                    )}
                    <label>
                      {t("properties.fontStyle")}
                      <select
                        value={props.fontFamily ?? "Georgia"}
                        onChange={(event) =>
                          update({ fontFamily: event.target.value as ItemProps["fontFamily"] })
                        }
                      >
                        <option value="Georgia">{t("properties.serifFont")}</option>
                        <option value="Arial">{t("properties.sansSerifFont")}</option>
                        <option value="EB Garamond">EB Garamond</option>
                      </select>
                    </label>
                    <label>
                      {t("properties.utilityFontSize")}
                      <input
                        type="number"
                        min={8}
                        max={200}
                        value={props.fontSize ?? 16}
                        onChange={(event) => update({ fontSize: Number(event.target.value) })}
                      />
                    </label>
                    <ColorControl
                      key={`${selection}-text-${props.color}`}
                      label={t("properties.utilityTextColor")}
                      value={props.color ?? "#493a34"}
                      onChange={(color) => update({ color })}
                    />
                    <ColorControl
                      key={`${selection}-accent-${props.accent}`}
                      label={t("properties.accentColor")}
                      value={props.accent ?? "#873b46"}
                      onChange={(accent) => update({ accent })}
                    />
                    <ColorControl
                      key={`${selection}-bg-${props.background}`}
                      label={t("properties.utilityBackground")}
                      value={props.background ?? "#fffaf1"}
                      onChange={(background) => update({ background })}
                    />
                  </>
                )}
                {selected?.node?.data.name === "StudioText" && (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={props.textBinding === "invitationWording"}
                        onChange={(event) =>
                          update({
                            textBinding: event.target.checked ? "invitationWording" : undefined,
                          })
                        }
                      />
                      {t("properties.usePresetWording")}
                    </label>
                    <p>
                      <i>
                        {props.textBinding
                          ? t("properties.chooseGuestPreview")
                          : t("properties.editTextHint")}
                      </i>
                    </p>
                    <label>
                      {t("properties.content")}
                      <textarea
                        maxLength={10000}
                        value={
                          props.textBinding
                            ? (wordingPreview ?? defaultWordingText)
                            : (props.text ?? "")
                        }
                        disabled={!!props.textBinding}
                        onChange={(event) => update({ text: event.target.value })}
                      />
                    </label>
                    <details className={styles.typography} open>
                      <summary>{t("properties.typography")}</summary>
                      <div className={styles.textTools}>
                        {(
                          [
                            { key: "bold", label: t("properties.bold"), symbol: "B" },
                            { key: "italic", label: t("properties.italic"), symbol: "I" },
                            { key: "strike", label: t("properties.strike"), symbol: "S̶" },
                            { key: "underline", label: t("properties.underline"), symbol: "U̲" },
                            { key: "uppercase", label: t("properties.uppercase"), symbol: "Aa" },
                          ] as const
                        ).map(({ key, label, symbol }) => (
                          <button
                            key={key}
                            aria-label={label}
                            aria-pressed={props[key] ?? false}
                            title={label}
                            onClick={() => update({ [key]: !props[key] })}
                          >
                            {symbol}
                          </button>
                        ))}
                      </div>
                      <div className={styles.textRow}>
                        <span>{t("properties.alignment")}</span>
                        <div className={styles.textTools}>
                          {(
                            [
                              { key: "left", label: t("properties.alignLeft"), icon: AlignLeft },
                              {
                                key: "center",
                                label: t("properties.alignCenter"),
                                icon: AlignCenter,
                              },
                              { key: "right", label: t("properties.alignRight"), icon: AlignRight },
                              {
                                key: "justify",
                                label: t("properties.justify"),
                                icon: AlignJustify,
                              },
                            ] as const
                          ).map(({ key, label, icon: Icon }) => (
                            <button
                              key={key}
                              aria-label={label}
                              title={label}
                              aria-pressed={(props.textAlign ?? "left") === key}
                              onClick={() => update({ textAlign: key })}
                            >
                              <Icon size={15} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <label>
                        {t("properties.font")}
                        <select
                          value={props.fontFamily ?? "Arial"}
                          onChange={(event) =>
                            update({ fontFamily: event.target.value as ItemProps["fontFamily"] })
                          }
                        >
                          <option value="Arial">Arial</option>
                          <option value="Georgia">Georgia</option>
                          <option value="EB Garamond">EB Garamond</option>
                        </select>
                      </label>
                      <ColorControl
                        key={`${selection}-${props.color}`}
                        label={t("properties.textColor")}
                        value={props.color ?? "#493a34"}
                        onChange={(color) => update({ color })}
                      />
                      <label>
                        {t("properties.fontSize")}
                        <div className={styles.sizeRow}>
                          <button
                            aria-label={t("properties.decreaseFont")}
                            onClick={() => update({ fontSize: (props.fontSize ?? 32) - 1 })}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={8}
                            max={200}
                            value={props.fontSize ?? 32}
                            onChange={(event) =>
                              update({
                                fontSize: Math.max(8, Math.min(200, Number(event.target.value))),
                              })
                            }
                          />
                          <button
                            aria-label={t("properties.increaseFont")}
                            onClick={() => update({ fontSize: (props.fontSize ?? 32) + 1 })}
                          >
                            +
                          </button>
                        </div>
                      </label>
                      <ColorControl
                        key={`${selection}-text-bg-${props.background}`}
                        label={t("properties.textBackground")}
                        value={props.background ?? "#ffffff"}
                        onChange={(background) => update({ background })}
                      />
                      <button
                        onClick={() => {
                          if (selection)
                            actions.setProp(selection, (value: ItemProps) => {
                              delete value.background;
                            });
                        }}
                      >
                        {t("properties.removeTextBackground")}
                      </button>
                      <label>
                        {t("properties.lineHeight")}
                        <input
                          type="number"
                          min={0.8}
                          max={3}
                          step={0.1}
                          value={props.lineHeight ?? 1.2}
                          onChange={(event) => update({ lineHeight: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        {t("properties.opacity")}
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={props.opacity ?? 1}
                          onChange={(event) => update({ opacity: Number(event.target.value) })}
                        />
                      </label>
                      <input
                        aria-label={t("properties.opacitySlider")}
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={props.opacity ?? 1}
                        onChange={(event) => update({ opacity: Number(event.target.value) })}
                      />
                    </details>
                  </>
                )}
                {(["x", "y", "width", "height", "rotation"] as const).map((key) => (
                  <label key={key}>
                    {t(`properties.${key}`)}
                    <input
                      type="number"
                      value={Math.round(props[key] ?? 0)}
                      onChange={(event) =>
                        update({
                          [key]:
                            key === "width" || key === "height"
                              ? Math.max(20, Number(event.target.value))
                              : Number(event.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              </fieldset>
            )}
            <details className={styles.advanced}>
              <summary>{t("properties.advanced")}</summary>
              <h2>{t("properties.documentJson")}</h2>
              <button onClick={exportJson}>{t("properties.exportJson")}</button>
              <textarea
                aria-label={t("properties.documentJson")}
                className={styles.json}
                value={json}
                onChange={(event) => setJson(event.target.value)}
                placeholder={t("properties.jsonPlaceholder")}
              />
              <button disabled={preview || !json} onClick={() => importJson(json)}>
                {t("properties.openJson")}
              </button>
              <label className={styles.file}>
                {t("properties.openJsonFile")}
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={preview}
                  onChange={async (event) => {
                    const input = event.currentTarget;
                    const file = event.target.files?.[0];
                    if (file && file.size <= 500000) importJson(await file.text());
                    else if (file) setMessage(t("properties.jsonTooLarge"));
                    input.value = "";
                  }}
                />
              </label>
            </details>
          </aside>
        </div>
        {!preview && !editingCover && (
          <section className={styles.photoDock} aria-label={t("properties.quickReplaceAria")}>
            <button
              className={styles.dockToggle}
              aria-expanded={quickPhotosOpen}
              onClick={() => setQuickPhotosOpen(!quickPhotosOpen)}
            >
              {t("properties.quickReplace")} {quickPhotosOpen ? "⌄" : "⌃"}{" "}
              <small>
                {t("properties.imageCount", { count: formatNumber(photoEntries.length, language) })}
              </small>
            </button>
            {quickPhotosOpen && (
              <div className={styles.photoStrip}>
                {photoEntries.map((photo, index) => (
                  <button
                    key={`${photo.nodeId}-${photo.index}`}
                    aria-label={t("properties.goToImage", {
                      number: formatNumber(index + 1, language),
                    })}
                    title={photo.label}
                    aria-pressed={
                      selection === photo.nodeId &&
                      (photo.index < 0 || photoFocus?.index === photo.index)
                    }
                    onClick={() => goToPhoto(photo.nodeId, photo.index)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.src} alt={photo.label} />
                    <span>{index + 1}</span>
                  </button>
                ))}
                {!photoEntries.length && <p>{t("properties.quickReplaceHelp")}</p>}
              </div>
            )}
          </section>
        )}
      </main>
    </WordingPreviewContext>
  );
}

function ColorControl({
  label,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation("templateStudio");
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(false);
  function commit() {
    const hex = draft.trim().replace(/^#/, "");
    if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
      setError(true);
      return;
    }
    const normalized = `#${
      hex.length === 3
        ? hex
            .split("")
            .map((letter) => letter + letter)
            .join("")
        : hex
    }`.toLowerCase();
    setError(false);
    setDraft(normalized);
    if (normalized !== value) onChange(normalized);
  }
  return (
    <div className={styles.colorControl}>
      <span>{label}</span>
      <div className={styles.colorInputs}>
        <input
          aria-label={t("colors.picker", { label })}
          type="color"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          aria-label={t("colors.hex", { label })}
          type="text"
          value={draft}
          disabled={disabled}
          spellCheck={false}
          maxLength={7}
          aria-invalid={error}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(false);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              setDraft(value);
              setError(false);
            }
          }}
        />
      </div>
      {error && <small role="alert">{t("colors.invalid")}</small>}
    </div>
  );
}

export function TemplateStudio({
  initialTemplate = false,
  initialPreview = false,
  initialWording = false,
  wordingPanel,
  backHref,
  initialDocument,
  availableTemplates,
  onSave,
  onUploadImage,
  loadImages,
}: TemplateStudioProps) {
  const [focus, setFocus] = useState<PhotoFocus>(null);
  const [revision, setRevision] = useState(initialPreview ? 1 : 0);
  return (
    <PhotoFocusContext.Provider
      value={{ focus, select: (nodeId, index) => setFocus({ nodeId, index }) }}
    >
      <RevealReplayContext.Provider
        value={{ revision, replay: () => setRevision((value) => value + 1) }}
      >
        <Editor
          enabled={!initialPreview}
          onRender={StudioReveal}
          resolver={{
            StudioFrame,
            StudioText,
            StudioImage,
            StudioCalendar,
            StudioCountdown,
            StudioAlbum,
            StudioMap,
            StudioAction,
            StudioWishes,
            StudioInterview,
            StudioTimeline,
          }}
        >
          <Workspace
            initialTemplate={initialTemplate}
            initialPreview={initialPreview}
            initialWording={initialWording}
            wordingPanel={wordingPanel}
            backHref={backHref}
            initialDocument={initialDocument}
            availableTemplates={availableTemplates}
            onSave={onSave}
            onUploadImage={onUploadImage}
            loadImages={loadImages}
          />
        </Editor>
      </RevealReplayContext.Provider>
    </PhotoFocusContext.Provider>
  );
}
