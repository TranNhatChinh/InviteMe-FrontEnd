"use client";
/* eslint-disable @next/next/no-img-element -- Uploaded wedding images use API media URLs. */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import { useRuntime } from "@/core/config/runtime";
import { listStoryTemplates, publishWebsite, saveWebsite, uploadWeddingMedia, type Website } from "../api/website.api";
import { starterWeddingStory, type WeddingStoryDocument } from "../schemas/wedding-story.schema";
import { fromStoryV3, isStoryV3, toStoryDraftV3 } from "../schemas/story-v3.schema";
import { StoryClassic } from "./story-renderer";
import { resolveMediaUrl } from "@/core/config/media-url";
import { builtinStoryTemplateCatalog } from "../templates/story-templates";

type Tab = "appearance" | "couple" | "story" | "events" | "gallery" | "wishes";
const tabs: [Tab, string][] = [
  ["appearance", "Giao diện"],
  ["couple", "Cặp đôi"],
  ["story", "Love Story"],
  ["events", "Sự kiện"],
  ["gallery", "Album"],
  ["wishes", "Lời chúc & mừng cưới"],
];
const inputClass = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function WeddingStoryEditor({
  weddingId,
  site,
  demo = false,
}: {
  weddingId: string;
  site: Website;
  demo?: boolean;
}) {
  const { api } = useRuntime();
  const cache = useQueryClient();
  const templatesQuery = useQuery({ queryKey: ["story-templates"], queryFn: () => listStoryTemplates(api), enabled: !demo });
  const templates = demo ? builtinStoryTemplateCatalog : templatesQuery.data ?? builtinStoryTemplateCatalog;
  const [doc, setDoc] = useState<WeddingStoryDocument>(
    isStoryV3(site.document)
      ? fromStoryV3(site.document)
      : site.document?.schemaVersion === 2
      ? (site.document as WeddingStoryDocument)
      : starterWeddingStory,
  );
  const [tab, setTab] = useState<Tab>("couple");
  const [version, setVersion] = useState(site.version);
  const [dirty, setDirty] = useState(!site.document);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const selectedTemplate = templates.find((template) => template.key === doc.templateId) ?? templates[0];
  const nextTemplate = templates.find((template) => template.key === pendingTemplate);
  const hidden = selectedTemplate && nextTemplate
    ? selectedTemplate.config.sections.filter((section) => !nextTemplate.config.sections.some((candidate) => candidate.type === section.type)).map((section) => section.type)
    : [];
  const themeColors = selectedTemplate?.config.palettes.find((palette) => palette.id === doc.paletteId)?.colors ?? selectedTemplate?.config.theme.colors;
  const previewDoc: WeddingStoryDocument = selectedTemplate && themeColors ? {
    ...doc,
    storyTemplate: {
      key: selectedTemplate.key, version: selectedTemplate.version, sections: selectedTemplate.config.sections,
      theme: { ...themeColors, fontHeading: doc.fontHeading ?? selectedTemplate.config.theme.fontHeading,
        fontBody: doc.fontBody ?? selectedTemplate.config.theme.fontBody },
      publishedAt: new Date(0).toISOString(),
    },
  } : doc;
  function change(update: (previous: WeddingStoryDocument) => WeddingStoryDocument) {
    setDoc(update);
    setDirty(true);
    setMessage("");
  }
  async function save(publish: boolean) {
    if (!doc.couple.groom.name.trim() || !doc.couple.bride.name.trim()) { setMessage("Hãy nhập tên cô dâu và chú rể."); return; }
    if (!doc.mainEventId || !doc.events.items.some((event) => event.id === doc.mainEventId)) { setMessage("Hãy chọn một sự kiện chính."); setTab("events"); return; }
    if (doc.events.items.some((event) => !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(event.date))) { setMessage("Ngày giờ sự kiện cần có múi giờ, ví dụ 2026-11-28T10:30:00+07:00."); setTab("events"); return; }
    setBusy(true);
    setMessage("");
    try {
      let current = version;
      if (dirty) {
        const result = await saveWebsite(api, weddingId, current, toStoryDraftV3(doc));
        current = result.version;
        setVersion(current);
        setDirty(false);
        cache.setQueryData(["website", weddingId], result);
      }
      if (publish) {
        const result = await publishWebsite(api, weddingId, current);
        setVersion(result.version);
        cache.setQueryData(["website", weddingId], result);
      }
      setMessage(publish ? "Đã xuất bản." : "Đã lưu bản nháp.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không lưu được.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File, done: (url: string) => void) {
    if (demo) {
      done(URL.createObjectURL(file));
      return;
    }
    setBusy(true);
    try {
      const result = await uploadWeddingMedia(api, weddingId, file);
      done(result.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tải được ảnh.");
    } finally {
      setBusy(false);
    }
  }
  function picker(label: string, done: (url: string) => void) {
    return (
      <label className="inline-block cursor-pointer rounded-lg border border-dashed border-primary px-3 py-2 text-primary">
        {label}
        <input
          className="sr-only"
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file, done);
            e.target.value = "";
          }}
        />
      </label>
    );
  }
  function editText(label: string, value: string, done: (value: string) => void, long = false) {
    return (
      <label className="block text-sm">
        {label}
        {long ? (
          <textarea
            className={inputClass}
            rows={3}
            value={value}
            onChange={(e) => done(e.target.value)}
          />
        ) : (
          <input className={inputClass} value={value} onChange={(e) => done(e.target.value)} />
        )}
      </label>
    );
  }
  function toggle(label: string, value: boolean, done: (value: boolean) => void) {
    return (
      <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
        {label}
        <input type="checkbox" checked={value} onChange={(e) => done(e.target.checked)} />
      </label>
    );
  }
  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[620px] flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-5 py-3">
        <div>
          <h1 className="font-display text-lg font-semibold">Wedding Story Studio</h1>
          <p className="text-xs text-muted-foreground">Mẫu {selectedTemplate?.name ?? doc.templateId} · Bố cục và hiệu ứng theo mẫu</p>
        </div>
        <div className="flex gap-2">
          <Button
            className="md:hidden"
            size="sm"
            variant="outline"
            onClick={() => setPreview(!preview)}
          >
            {preview ? "Chỉnh sửa" : "Xem trước"}
          </Button>
          {demo ? (
            <span className="rounded-full bg-muted px-3 py-1 text-xs">
              Bản xem thử · thay đổi chưa lưu
            </span>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !dirty}
                onClick={() => void save(false)}
              >
                Lưu nháp
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void save(true)}>
                Xuất bản
              </Button>
            </>
          )}
        </div>
        {message && (
          <p role="status" className="w-full text-sm">
            {message}
          </p>
        )}
      </header>
      <div className="flex min-h-0 flex-1">
        <aside
          className={`${preview ? "hidden" : "flex"} w-full flex-col border-r bg-card md:flex md:w-[410px]`}
        >
          <nav
            className="flex gap-1 overflow-x-auto border-b p-2 md:flex-wrap"
            aria-label="Mục chỉnh sửa"
          >
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs ${tab === id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            {tab === "appearance" && (
              <>
                <h2 className="font-semibold">Mẫu Wedding Story</h2>
                <div className="grid grid-cols-2 gap-2">
                  {templates.map((template) => <button type="button" key={template.key} className={`rounded-lg border p-3 text-left ${doc.templateId === template.key ? "border-primary bg-primary/5" : ""}`} onClick={() => template.key !== doc.templateId && setPendingTemplate(template.key)}><strong>{template.name}</strong><span className="mt-1 block text-xs text-muted-foreground">{template.config.sections.map((section) => section.type).join(" · ")}</span></button>)}
                </div>
                {pendingTemplate && nextTemplate && <div role="dialog" aria-modal="true" aria-label="Xác nhận đổi mẫu" className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950"><strong>Đổi sang {nextTemplate.name}?</strong><p className="mt-2">{hidden.length ? `Mẫu mới không hiển thị: ${hidden.map((section) => section === "loveStory" ? "Chuyện tình" : section).join(", ")}. Nội dung vẫn được giữ trong bản nháp.` : "Nội dung hiện có vẫn được giữ."} Bảng màu và font sẽ về mặc định của mẫu mới. Trang đã xuất bản chỉ đổi khi bạn xuất bản lại.</p><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => setPendingTemplate(null)}>Hủy</Button><Button size="sm" onClick={() => { change((d) => ({ ...d, templateId: nextTemplate.key, paletteId: nextTemplate.config.palettes[0]?.id, fontHeading: undefined, fontBody: undefined, storyTemplate: undefined })); setPendingTemplate(null); setTab("appearance"); }}>Đổi mẫu</Button></div></div>}
                <p className="text-sm text-muted-foreground">
                  Template quyết định bố cục và chuyển động.
                </p>
                <label className="block text-sm">Bảng màu<select className={inputClass} value={doc.paletteId ?? selectedTemplate?.config.palettes[0]?.id ?? ""} onChange={(e) => change((d) => ({ ...d, paletteId: e.target.value }))}>{selectedTemplate?.config.palettes.map((palette) => <option key={palette.id} value={palette.id}>{palette.label}</option>)}</select></label>
                <label className="block text-sm">Font tiêu đề<select className={inputClass} value={doc.fontHeading ?? selectedTemplate?.config.theme.fontHeading ?? ""} onChange={(e) => change((d) => ({ ...d, fontHeading: e.target.value }))}>{selectedTemplate?.config.allowedFonts.map((font) => <option key={font}>{font}</option>)}</select></label>
                <label className="block text-sm">Font nội dung<select className={inputClass} value={doc.fontBody ?? selectedTemplate?.config.theme.fontBody ?? ""} onChange={(e) => change((d) => ({ ...d, fontBody: e.target.value }))}>{selectedTemplate?.config.allowedFonts.map((font) => <option key={font}>{font}</option>)}</select></label>
                <label className="block text-sm">
                  Hiệu ứng
                  <select
                    className={inputClass}
                    value={doc.motion}
                    onChange={(e) =>
                      change((d) => ({
                        ...d,
                        motion: e.target.value as WeddingStoryDocument["motion"],
                      }))
                    }
                  >
                    <option value="template">Theo mẫu</option>
                    <option value="off">Tắt</option>
                  </select>
                </label>
              </>
            )}
            {tab === "couple" && (
              <>
                <p className="text-xs text-muted-foreground">Ngày trên trang đầu và đồng hồ lấy từ sự kiện chính trong mục Sự kiện.</p>
                {picker("Tải ảnh bìa", (url) =>
                  change((d) => ({ ...d, couple: { ...d.couple, coverImage: url } })),
                )}
                {selectedTemplate?.config.sections.some((section) => section.type === "hero" && section.variant === "floral") && <div className="space-y-2 rounded-lg border p-3"><strong>Ảnh trình chiếu</strong><p className="text-xs text-muted-foreground">Tối đa 3 ảnh; ảnh bìa dùng khi chưa thêm ảnh.</p>{(doc.couple.slides ?? []).map((src, index) => <div className="flex items-center gap-2" key={`${src}-${index}`}><img src={resolveMediaUrl(src) ?? src} alt={`Slide ${index + 1}`} className="h-12 w-12 rounded object-cover" /><button type="button" onClick={() => change((d) => ({ ...d, couple: { ...d.couple, slides: d.couple.slides?.filter((_, i) => i !== index) } }))}>Xóa</button></div>)}{(doc.couple.slides?.length ?? 0) < 3 && picker("Thêm ảnh slide", (url) => change((d) => ({ ...d, couple: { ...d.couple, slides: [...(d.couple.slides ?? []), url] } })))}</div>}
                {(["groom", "bride"] as const).map((role) => (
                  <div key={role} className="space-y-3 rounded-xl border p-4">
                    <h2 className="font-semibold">{role === "groom" ? "Chú rể" : "Cô dâu"}</h2>
                    {editText("Tên", doc.couple[role].name, (value) =>
                      change((d) => ({
                        ...d,
                        couple: { ...d.couple, [role]: { ...d.couple[role], name: value } },
                      })),
                    )}
                    {editText("Tên ngắn", doc.couple[role].shortName ?? "", (value) => change((d) => ({ ...d, couple: { ...d.couple, [role]: { ...d.couple[role], shortName: value } } })))}
                    {editText("Tên cha", doc.couple[role].father ?? "", (value) => change((d) => ({ ...d, couple: { ...d.couple, [role]: { ...d.couple[role], father: value } } })))}
                    {editText("Tên mẹ", doc.couple[role].mother ?? "", (value) => change((d) => ({ ...d, couple: { ...d.couple, [role]: { ...d.couple[role], mother: value } } })))}
                    {(["facebook", "instagram"] as const).map((network) => <div key={network}>{editText(network === "facebook" ? "Facebook" : "Instagram", doc.couple[role].social?.[network] ?? "", (value) => change((d) => ({ ...d, couple: { ...d.couple, [role]: { ...d.couple[role], social: { ...d.couple[role].social, [network]: value } } } })) )}</div>)}
                    {editText(
                      "Giới thiệu",
                      doc.couple[role].bio,
                      (value) =>
                        change((d) => ({
                          ...d,
                          couple: { ...d.couple, [role]: { ...d.couple[role], bio: value } },
                        })),
                      true,
                    )}
                    {picker("Tải ảnh chân dung", (url) =>
                      change((d) => ({
                        ...d,
                        couple: { ...d.couple, [role]: { ...d.couple[role], photo: url } },
                      })),
                    )}
                  </div>
                ))}
              </>
            )}
            {tab === "story" && (
              <>
                {toggle("Hiển thị chuyện tình", doc.story.enabled, (value) =>
                  change((d) => ({ ...d, story: { ...d.story, enabled: value } })),
                )}
                {editText("Lời mở đầu câu chuyện", doc.quote ?? "", (value) =>
                  change((d) => ({ ...d, quote: value })), true,
                )}
                {doc.story.items.map((item, index) => (
                  <div className="space-y-3 rounded-xl border p-4" key={item.id}>
                    <div className="flex items-center justify-between">
                      <strong>Mốc {index + 1}</strong>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            change((d) => ({
                              ...d,
                              story: { ...d.story, items: move(d.story.items, index, -1) },
                            }))
                          }
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            change((d) => ({
                              ...d,
                              story: { ...d.story, items: move(d.story.items, index, 1) },
                            }))
                          }
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          aria-label="Xóa mốc"
                          onClick={() =>
                            change((d) => ({
                              ...d,
                              story: {
                                ...d.story,
                                items: d.story.items.filter((x) => x.id !== item.id),
                              },
                            }))
                          }
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {(["date", "title", "body"] as const).map((key) => (
                      <div key={key}>
                        {editText(
                          { date: "Ngày", title: "Tiêu đề", body: "Nội dung" }[key],
                          item[key],
                          (value) =>
                            change((d) => ({
                              ...d,
                              story: {
                                ...d.story,
                                items: d.story.items.map((x) =>
                                  x.id === item.id ? { ...x, [key]: value } : x,
                                ),
                              },
                            })),
                          key === "body",
                        )}
                      </div>
                    ))}
                    {picker("Tải ảnh mốc", (url) =>
                      change((d) => ({
                        ...d,
                        story: {
                          ...d.story,
                          items: d.story.items.map((x) =>
                            x.id === item.id ? { ...x, image: url } : x,
                          ),
                        },
                      })),
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  disabled={doc.story.items.length >= 20}
                  onClick={() =>
                    change((d) => ({
                      ...d,
                      story: {
                        ...d.story,
                        items: [
                          ...d.story.items,
                          {
                            id: crypto.randomUUID(),
                            date: "",
                            title: "Mốc mới",
                            body: "",
                            image: "",
                          },
                        ],
                      },
                    }))
                  }
                >
                  Thêm mốc
                </Button>
              </>
            )}
            {tab === "events" && (
              <>
                {toggle("Hiển thị sự kiện", doc.events.enabled, (value) =>
                  change((d) => ({ ...d, events: { ...d.events, enabled: value } })),
                )}
                {doc.events.items.map((item, index) => (
                  <div className="space-y-3 rounded-xl border p-4" key={item.id}>
                    <div className="flex justify-between">
                      <strong>Sự kiện {index + 1}</strong>
                      <label className="text-xs"><input type="radio" name="main-story-event" checked={(doc.mainEventId ?? doc.events.items[0]?.id) === item.id} onChange={() => change((d) => ({ ...d, mainEventId: item.id }))} /> Sự kiện chính</label>
                      <button
                        type="button"
                        aria-label="Xóa sự kiện"
                        onClick={() =>
                          change((d) => ({
                            ...d,
                            events: {
                              ...d.events,
                              items: d.events.items.filter((x) => x.id !== item.id),
                            },
                            mainEventId: d.mainEventId === item.id ? d.events.items.find((x) => x.id !== item.id)?.id : d.mainEventId,
                          }))
                        }
                      >
                        ×
                      </button>
                    </div>
                    {(["title", "date", "venue", "address", "mapUrl"] as const).map((key) => (
                      <div key={key}>
                        {editText(
                          {
                            title: "Tên",
                            date: "Ngày giờ ISO có múi giờ (VD: 2026-11-28T10:30:00+07:00)",
                            venue: "Địa điểm",
                            address: "Địa chỉ",
                            mapUrl: "Link bản đồ",
                          }[key],
                          item[key],
                          (value) =>
                            change((d) => ({
                              ...d,
                              events: {
                                ...d.events,
                                items: d.events.items.map((x) =>
                                  x.id === item.id ? { ...x, [key]: value } : x,
                                ),
                              },
                            })),
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                <Button
                  variant="outline"
                  disabled={doc.events.items.length >= 20}
                  onClick={() =>
                    change((d) => ({
                      ...d,
                      events: {
                        ...d.events,
                        items: [
                          ...d.events.items,
                          {
                            id: crypto.randomUUID(),
                            title: "Sự kiện mới",
                            date: "2026-11-28T10:30:00+07:00",
                            venue: "",
                            address: "",
                            mapUrl: "",
                          },
                        ],
                      },
                    }))
                  }
                >
                  Thêm sự kiện
                </Button>
              </>
            )}
            {tab === "gallery" && (
              <>
                <p className="text-xs text-muted-foreground">Có thể lưu tối đa 30 ảnh. Mẫu hiện hiển thị 12 ảnh đầu; ảnh còn lại vẫn được giữ.</p>
                {toggle("Hiển thị album", doc.gallery.enabled, (value) =>
                  change((d) => ({ ...d, gallery: { ...d.gallery, enabled: value } })),
                )}
                <div className="grid grid-cols-3 gap-2">
                  {doc.gallery.images.map((src, index) => (
                    <div key={`${src}-${index}`} className="relative">
                      <img
                        className="aspect-square w-full rounded object-cover"
                        src={resolveMediaUrl(src) ?? src}
                        alt={`Ảnh cưới ${index + 1}`}
                      />
                      <button
                        type="button"
                        aria-label="Xóa ảnh"
                        className="absolute right-1 top-1 bg-white p-1"
                        onClick={() =>
                          change((d) => ({
                            ...d,
                            gallery: {
                              ...d.gallery,
                              images: d.gallery.images.filter((_, i) => i !== index),
                            },
                          }))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                {doc.gallery.images.length < 30 &&
                  picker("Thêm ảnh album", (url) =>
                    change((d) => ({
                      ...d,
                      gallery: { ...d.gallery, images: [...d.gallery.images, url] },
                    })),
                  )}
              </>
            )}
            {tab === "wishes" && (
              <>
                {toggle("Hiển thị lời chúc", doc.wishes.enabled, (value) =>
                  change((d) => ({ ...d, wishes: { enabled: value } })),
                )}
                {toggle("Hiển thị mừng cưới", doc.gift.enabled, (value) =>
                  change((d) => ({ ...d, gift: { ...d.gift, enabled: value } })),
                )}
                {(["groom", "bride"] as const).map((role) => (
                  <div key={role} className="space-y-3 rounded-xl border p-4">
                    <strong>{role === "groom" ? "Chú rể" : "Cô dâu"}</strong>
                    {editText("Ngân hàng", doc.gift[`${role}Bank`], (value) =>
                      change((d) => ({ ...d, gift: { ...d.gift, [`${role}Bank`]: value } })),
                    )}
                    {editText("Tên chủ tài khoản", doc.gift[`${role}Holder`], (value) =>
                      change((d) => ({ ...d, gift: { ...d.gift, [`${role}Holder`]: value } })),
                    )}
                    {editText("Số tài khoản", doc.gift[`${role}Account`], (value) =>
                      change((d) => ({ ...d, gift: { ...d.gift, [`${role}Account`]: value } })),
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </aside>
        <div
          className={`${preview ? "block" : "hidden"} min-w-0 flex-1 overflow-y-auto bg-muted p-3 md:block md:p-6`}
        >
          <div className="mx-auto max-w-[1200px] overflow-hidden rounded-xl bg-white shadow">
            <StoryClassic document={previewDoc} />
          </div>
        </div>
      </div>
    </div>
  );
}

function move<T>(items: T[], index: number, offset: number) {
  const result = [...items];
  const target = index + offset;
  if (target < 0 || target >= result.length) return result;
  const first = result[index];
  const second = result[target];
  if (first === undefined || second === undefined) return result;
  result[index] = second;
  result[target] = first;
  return result;
}
