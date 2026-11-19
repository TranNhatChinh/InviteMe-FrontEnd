"use client";

import { Editor, Element, Frame, useEditor } from "@craftjs/core";
import Moveable from "react-moveable";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Menu, ZoomIn, ZoomOut } from "lucide-react";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { flushSync } from "react-dom";
import { AlignLeft, AlignCenter, AlignRight, AlignJustify, Undo2, Redo2 } from "lucide-react";
import {
  Type,
  ImageIcon,
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
import { Modal } from "@/shared/ui/modal";
import { GiftPreviewContext } from "../components/gift-preview";
import { PreviewViewport } from "../components/preview-viewport";
import { InvitationCover } from "../components/invitation-cover";
import { FallingParticles } from "../components/falling-particles";
import { resolveParticles } from "../components/particle-settings";
import { TemplateThumbnail } from "../components/template-thumbnail";
import { studioTemplates as templateCatalog, findTemplate } from "../templates/catalog";
import { isValidEventDate } from "../components/date-utils";
import { giftConfigurationError, parseStudioDocument } from "../schemas/document";
import { resolveInvitationDocument } from "../api/design.api";
import { PhotoFocusContext, type PhotoFocus } from "../components/photo-focus";
import styles from "./studio.module.css";
import { StudioBackups } from "./studio-backups";
import { BackgroundPanel } from "./background-panel";
import { EffectsPanel } from "./effects-panel";
import { MusicPanel } from "./music-panel";
import { BrandLogo } from "@/shared/components/brand-logo";
import { ActionMenu } from "@/shared/ui/action-menu";
import type { TemplateStudioProps } from "./studio.types";
import { WordingPreviewContext } from "../components/wording-preview";
import { defaultWordingText, resolveCoverGreeting } from "../components/wording-text";
import { StudioReveal, RevealReplayContext, RevealPausedContext } from "../components/reveal";
import { useRuntime } from "@/core/config/runtime";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/i18n/format";
import { useLanguage } from "@/i18n/language-context";

function Workspace({
  giftPanel,
  giftPreview,
  initialTemplate = false,
  initialPreview = false,
  initialWording = false,
  wordingPanel,
  backHref,
  backup,
  adminLayout,
  initialDocument,
  availableTemplates,
  onSave,
  onPublish,
  onUploadImage,
  loadImages,
  resolvedMusic,
}: TemplateStudioProps) {
  const { api } = useRuntime();
  const router = useRouter();
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
    frameHeight,
    revealPreset,
  } = useEditor((state, query) => {
    const id = Array.from(state.events.selected)[0];
    return {
      selected: id && id !== "ROOT" ? { id, node: state.nodes[id] } : undefined,
      canUndo: query.history.canUndo(),
      canRedo: query.history.canRedo(),
      items: state.nodes.ROOT?.data.nodes ?? [],
      serialized: query.serialize(),
      revealPreset: state.nodes.ROOT?.data.props.revealPreset ?? "none",
      frameHeight: state.nodes.ROOT ? Number(state.nodes.ROOT.data.props.height ?? 760) : null,
      background: (state.nodes.ROOT?.data.props.background as string | undefined) ?? "#fffaf1",
    };
  });
  const { replay } = useContext(RevealReplayContext);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [templateId, setTemplateId] = useState<string | undefined>(() =>
    initialDocument
      ? parseStudioDocument(initialDocument).templateId
      : (findTemplate(initialTemplate)?.id ??
        (typeof initialTemplate === "string" ? initialTemplate : undefined)),
  );
  const [coverOpen, setCoverOpen] = useState(false);
  const [giftWarning, setGiftWarning] = useState("");
  const [preview, setPreview] = useState(initialPreview);
  const [category, setCategory] = useState(
    adminLayout ? "page" : initialWording ? "presets" : initialTemplate ? "templates" : "utilities",
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
  const [zoom, setZoom] = useState(100);
  const quickView = useMemo(() => {
    if (!adminLayout || category !== "page" || preview) return null;
    try {
      return parseStudioDocument(
        JSON.stringify({ schemaVersion: 1, nodes: JSON.parse(serialized) }),
      );
    } catch {
      return null;
    }
  }, [adminLayout, category, preview, serialized]);
  const { focus: photoFocus, select: selectPhoto } = useContext(PhotoFocusContext);
  const propertyPanel = useRef<HTMLElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const heightDrag = useRef<{
    startY: number;
    initialHeight: number;
    lastHeight: number;
    changed: boolean;
  } | null>(null);
  const workspace = useRef<HTMLElement>(null);
  const [previewWidth, setPreviewWidth] = useState(480);
  const observeWorkspace = useCallback((element: HTMLElement | null) => {
    workspace.current = element;
    if (!element) return;
    const observer = new ResizeObserver(() => setPreviewWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const moveable = useRef<Moveable>(null);
  const cover = query.getNodes().ROOT?.data.props.cover as ItemProps["cover"];
  const particles = resolveParticles(query.getNodes().ROOT?.data.props as ItemProps);
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

  useEffect(() => {
    if (adminLayout) moveable.current?.updateRect();
  }, [adminLayout, zoom]);

  function setFrameHeight(value: number, mergeHistory = false) {
    if (frameHeight === null || !Number.isFinite(value)) return;
    const height = Math.max(20, Math.min(10000, Math.round(value)));
    if (height === Number(query.getNodes().ROOT?.data.props.height ?? 760)) return;
    const editor = mergeHistory ? actions.history.merge() : actions;
    editor.setProp("ROOT", (props: ItemProps) => {
      props.height = height;
    });
  }

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
  function showGiftConfiguration() {
    const giftId = items.find((id) => {
      const node = query.getNodes()[id];
      return (
        node?.data.name === "StudioAction" && node.data.props.action === "gift" && !node.data.hidden
      );
    });
    if (!giftId) return;
    setGiftWarning("");
    setPreview(false);
    setCategory("utilities");
    actions.setOptions((options) => {
      options.enabled = true;
    });
    actions.selectNode(giftId);
    requestAnimationFrame(() => {
      const element = Array.from(
        stage.current?.querySelectorAll<HTMLElement>("[data-studio-node]") ?? [],
      ).find((item) => item.dataset.studioNode === giftId);
      element?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      propertyPanel.current
        ?.querySelector('[aria-label="Cấu hình hộp quà mừng"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  async function saveDesign(publish = false) {
    const persist = publish ? onPublish : onSave;
    if (!persist || saving) return;
    setSaving(publish ? "publish" : "draft");
    try {
      const doc = parseStudioDocument(
        JSON.stringify({ schemaVersion: 1, templateId, nodes: JSON.parse(query.serialize()) }),
      );
      const giftError = giftConfigurationError(doc);
      if (giftError) {
        setMessage(giftError);
        setGiftWarning(giftError);
        return;
      }
      await persist(JSON.stringify(doc));
      setMessage(publish ? t("invitations:saved.publishSuccess") : t("status.draftSaved"));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : publish
            ? t("invitations:saved.publishFailed")
            : t("status.saveFailed"),
      );
    } finally {
      setSaving(null);
    }
  }
  function importJson(value: string) {
    try {
      const document = parseStudioDocument(value);
      setTemplateId(document.templateId);
      actions.deserialize(JSON.stringify(document.nodes));
      actions.selectNode();
      setMessage(t("status.jsonOpened"));
    } catch {
      setMessage(t("status.jsonOpenFailed"));
    }
  }

  const historyButtons = (
    <>
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
    </>
  );

  const navigationMenu = (
    <ActionMenu
      label={t("header.navigationMenu")}
      icon={<Menu size={16} aria-hidden="true" />}
      triggerClassName={styles.menuTrigger}
      align="start"
      items={[
        ...(backHref
          ? [
              {
                label: adminLayout?.backLabel ?? t("header.backWedding"),
                onSelect: () => router.push(backHref),
              },
            ]
          : []),
        {
          label: adminLayout ? t("header.adminHome") : t("library.weddingList"),
          onSelect: () => router.push(adminLayout ? "/admin" : "/weddings"),
        },
        { label: t("header.home"), onSelect: () => router.push("/") },
      ]}
    />
  );

  const toolbar = (
    <header className={`${styles.header} ${styles.studioToolbar}`}>
      {adminLayout && backHref ? (
        <div className={styles.studioIdentity}>
          {navigationMenu}
          <Link href={backHref} aria-label={adminLayout.backLabel} title={adminLayout.backLabel}>
            <ArrowLeft size={20} />
          </Link>
          <BrandLogo size="sm" className={styles.studioBrand} />
          <h1 className="sr-only">InviteMe Studio</h1>
          <div className={styles.buttons}>{historyButtons}</div>
        </div>
      ) : (
        <div className={styles.studioIdentity}>
          {navigationMenu}
          <BrandLogo size="sm" className={styles.studioBrand} />
          <h1 className="sr-only">{t("header.title")}</h1>
        </div>
      )}
      <p className={styles.status} role="status">
        {adminLayout?.status || message}
      </p>
      <div className={styles.buttons}>
        {backup && onSave && !initialPreview && (
          <StudioBackups
            key={backup.scope}
            scope={backup.scope}
            title={backup.title}
            document={
              frameHeight === null
                ? null
                : JSON.stringify({
                    schemaVersion: 1,
                    templateId,
                    nodes: JSON.parse(serialized),
                  })
            }
            onRestore={importJson}
          />
        )}
        {onSave && (
          <button
            className={styles.saveButton}
            disabled={saving !== null}
            onClick={() => void saveDesign()}
          >
            {saving === "draft"
              ? t("header.saving")
              : t(adminLayout ? "adminLayout.saveDraft" : "header.saveDraft")}
          </button>
        )}
        {!adminLayout && historyButtons}
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
          {preview ? t("header.edit") : t("header.preview")}
        </button>
        {onPublish && (
          <button
            className={styles.saveButton}
            disabled={saving !== null}
            onClick={() => void saveDesign(true)}
          >
            {t(saving === "publish" ? "invitations:saved.publishing" : "invitations:saved.publish")}
          </button>
        )}
        {adminLayout?.toolbarAction}
      </div>
    </header>
  );
  const content = (
    <WordingPreviewContext value={wordingPreview}>
      <main
        id="main-content"
        className={styles.studio}
        data-admin-layout={Boolean(adminLayout)}
        data-preview={preview}
        data-cover-editor={editingCover}
        style={
          {
            "--photo-dock-height":
              preview || editingCover ? "0px" : quickPhotosOpen ? "128px" : "36px",
          } as CSSProperties
        }
      >
        <FallingParticles effect={particles} />
        {!preview && toolbar}
        <div className={styles.layout}>
          <aside className={styles.library} aria-label={t("categories.libraryAria")}>
            <nav className={styles.rail} aria-label={t("categories.navAria")}>
              {[
                { id: "cover", icon: Mail },
                { id: "text", icon: Type },
                { id: "image", icon: ImageIcon },
                { id: "shapes", icon: Shapes },
                { id: "background", icon: Paintbrush },
                { id: "music", icon: Music },
                { id: "utilities", icon: CalendarDays },
                { id: "templates", icon: LayoutTemplate },
                { id: "effects", icon: WandSparkles },
                { id: "layers", icon: Layers },
                ...(adminLayout ? [{ id: "page", icon: FileText }] : []),
              ].map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  aria-pressed={category === id}
                  onClick={() => {
                    actions.selectNode();
                    setTarget(null);
                    setCategory(id);
                    if (!adminLayout) workspace.current?.scrollTo({ top: 0 });
                  }}
                >
                  <Icon size={22} />
                  <span>{t(`categories.${id}`)}</span>
                </button>
              ))}
            </nav>
            <div className={styles.libraryContent}>
              {adminLayout && category === "page" && (
                <>
                  <h2>{t("adminLayout.quickView")}</h2>
                  <p>{t("adminLayout.quickViewHelp")}</p>
                  {quickView && (
                    <button
                      type="button"
                      className={styles.quickView}
                      aria-label={t("adminLayout.jumpToPage")}
                      onClick={(event) => {
                        const canvas = workspace.current;
                        const frame = stage.current?.querySelector("[data-studio-frame]");
                        if (!canvas || !frame) return;
                        const bounds = event.currentTarget.getBoundingClientRect();
                        const fraction = event.detail
                          ? (event.clientY - bounds.top) / bounds.height
                          : 0.5;
                        canvas.scrollTo({
                          top:
                            canvas.scrollTop +
                            frame.getBoundingClientRect().top -
                            canvas.getBoundingClientRect().top +
                            fraction * frame.getBoundingClientRect().height -
                            canvas.clientHeight / 2,
                        });
                      }}
                    >
                      <TemplateThumbnail document={quickView} fluid full />
                    </button>
                  )}
                </>
              )}
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
                    {t("library.uploadedFiles", {
                      count: formatNumber(uploads.length, language),
                    })}
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
                <BackgroundPanel
                  value={query.getNodes().ROOT?.data.props as ItemProps}
                  disabled={preview}
                  onUpload={onUploadImage}
                  onChange={(patch) =>
                    actions.setProp("ROOT", (value: ItemProps) => Object.assign(value, patch))
                  }
                />
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
                          if (canUndo && !window.confirm(t("ui:studio.confirmTemplateSwitch"))) {
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
                          value={particles}
                          onChange={(event) =>
                            actions.setProp("ROOT", (value: ItemProps) => {
                              value.particles = event.target.value as ItemProps["particles"];
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
                <EffectsPanel
                  cover={cover}
                  particles={particles}
                  onParticlesChange={(effect) =>
                    actions.setProp("ROOT", (value: ItemProps) => {
                      value.particles = effect;
                      if (value.cover) value.cover.particles = effect;
                    })
                  }
                  disabled={preview}
                  onOpenCover={() => setCategory("cover")}
                  onCoverChange={(patch) =>
                    actions.setProp("ROOT", (value: ItemProps) => {
                      if (value.cover) Object.assign(value.cover, patch);
                    })
                  }
                >
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
                  <p>{t("library.effectHelp")}</p>
                </EffectsPanel>
              )}
              {category === "music" && (
                <MusicPanel
                  value={query.getNodes().ROOT?.data.props.music}
                  resolved={resolvedMusic}
                  disabled={preview}
                  onChange={(music) =>
                    actions.setProp("ROOT", (value: ItemProps) => {
                      value.music = music;
                    })
                  }
                />
              )}
              {["stock", "shapes"].includes(category) && (
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
            ref={observeWorkspace}
            className={`template-canvas ${styles.workspace}`}
            aria-label={t("library.workspaceAria")}
          >
            <RevealPausedContext.Provider value={showingCover}>
              <div
                ref={stage}
                className={styles.stage}
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
                    : zoom / 100,
                }}
                onClick={synchronizeTarget}
                onPointerUp={synchronizeTarget}
              >
                <Frame />
                {!preview && !editingCover && frameHeight !== null && (
                  <div className={styles.heightControls}>
                    <button
                      type="button"
                      className={styles.heightHandle}
                      aria-label={t("library.resizeHeight")}
                      title={t("library.resizeHeight")}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        heightDrag.current = {
                          startY: event.clientY,
                          initialHeight: frameHeight,
                          lastHeight: frameHeight,
                          changed: false,
                        };
                      }}
                      onPointerMove={(event) => {
                        const drag = heightDrag.current;
                        if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId))
                          return;
                        const height = Math.max(
                          20,
                          Math.min(
                            10000,
                            Math.round(
                              drag.initialHeight + (event.clientY - drag.startY) / (zoom / 100),
                            ),
                          ),
                        );
                        if (height === drag.lastHeight) return;
                        setFrameHeight(height, drag.changed);
                        drag.changed = true;
                        drag.lastHeight = height;
                      }}
                      onLostPointerCapture={() => {
                        heightDrag.current = null;
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                        event.preventDefault();
                        setFrameHeight(frameHeight + (event.key === "ArrowDown" ? 100 : -100));
                      }}
                    />
                    <div
                      className={styles.heightStepper}
                      role="group"
                      aria-label={t("library.frameHeight")}
                    >
                      <button
                        type="button"
                        aria-label={t("library.decreaseHeight")}
                        disabled={frameHeight <= 20}
                        onClick={() => setFrameHeight(frameHeight - 100)}
                      >
                        −
                      </button>
                      <input
                        key={frameHeight}
                        type="number"
                        min={20}
                        max={10000}
                        defaultValue={frameHeight}
                        aria-label={t("library.frameHeight")}
                        onBlur={(event) => {
                          setFrameHeight(event.currentTarget.valueAsNumber);
                          event.currentTarget.value = String(frameHeight);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                          }
                        }}
                      />
                      <span>px</span>
                      <button
                        type="button"
                        aria-label={t("library.increaseHeight")}
                        disabled={frameHeight >= 10000}
                        onClick={() => setFrameHeight(frameHeight + 100)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
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
          {adminLayout && !preview && !editingCover && (
            <div className={styles.zoomControls} role="group" aria-label={t("adminLayout.zoom")}>
              <button
                type="button"
                aria-label={t("adminLayout.zoomIn")}
                disabled={zoom >= 150}
                onClick={() => setZoom((value) => value + 25)}
              >
                <ZoomIn size={17} />
              </button>
              <span aria-live="polite">{zoom}%</span>
              <button
                type="button"
                aria-label={t("adminLayout.zoomOut")}
                disabled={zoom <= 50}
                onClick={() => setZoom((value) => value - 25)}
              >
                <ZoomOut size={17} />
              </button>
            </div>
          )}
          <aside ref={propertyPanel} className={styles.panel} hidden={editingCover}>
            {adminLayout && !selection && (
              <section className={styles.templateSettings}>
                <h2>{t("adminLayout.settings")}</h2>
                {adminLayout.settings}
              </section>
            )}
            <h2>{t("properties.title")}</h2>
            {props.action !== "gift" &&
              giftPanel &&
              items.some(
                (id) =>
                  query.getNodes()[id]?.data.props.action === "gift" &&
                  !query.getNodes()[id]?.data.hidden,
              ) && (
                <button type="button" className="mb-4 w-full" onClick={showGiftConfiguration}>
                  Cấu hình hộp quà mừng
                </button>
              )}
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
                        update({
                          images: albumImages.filter((_, index) => index !== albumIndex),
                        });
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
                        {props.action !== "gift" && (
                          <label>
                            {t("properties.content")}
                            <textarea
                              maxLength={2000}
                              value={props.message ?? ""}
                              onChange={(event) => update({ message: event.target.value })}
                            />
                          </label>
                        )}
                        {props.action === "gift" &&
                          giftPanel?.({
                            value: query.getNodes().ROOT?.data.props.gift,
                            onChange: (gift) =>
                              actions.setProp("ROOT", (props) => {
                                props.gift = gift;
                              }),
                          })}
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
                              {
                                key: "right",
                                label: t("properties.alignRight"),
                                icon: AlignRight,
                              },
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
                {t("properties.imageCount", {
                  count: formatNumber(photoEntries.length, language),
                })}
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
  return (
    <GiftPreviewContext value={giftPreview?.(query.getNodes().ROOT?.data.props.gift)}>
      <Modal
        open={!!giftWarning}
        onClose={() => setGiftWarning("")}
        title="Cần cấu hình hộp quà mừng"
      >
        <p>{giftWarning}</p>
        <button
          type="button"
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-primary-foreground"
          onClick={showGiftConfiguration}
        >
          Cấu hình ngay
        </button>
      </Modal>
      <PreviewViewport active={preview} toolbar={toolbar}>
        {content}
      </PreviewViewport>
    </GiftPreviewContext>
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
  weddingId,
  giftPanel,
  giftPreview,
  initialTemplate = false,
  initialPreview = false,
  initialWording = false,
  wordingPanel,
  backHref,
  backup,
  adminLayout,
  initialDocument,
  availableTemplates,
  onSave,
  onPublish,
  onUploadImage,
  loadImages,
  resolvedMusic,
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
            weddingId={weddingId}
            giftPanel={giftPanel}
            giftPreview={giftPreview}
            initialTemplate={initialTemplate}
            initialPreview={initialPreview}
            initialWording={initialWording}
            wordingPanel={wordingPanel}
            backHref={backHref}
            backup={backup}
            adminLayout={adminLayout}
            initialDocument={initialDocument}
            availableTemplates={availableTemplates}
            onSave={onSave}
            onPublish={onPublish}
            onUploadImage={onUploadImage}
            loadImages={loadImages}
            resolvedMusic={resolvedMusic}
          />
        </Editor>
      </RevealReplayContext.Provider>
    </PhotoFocusContext.Provider>
  );
}
