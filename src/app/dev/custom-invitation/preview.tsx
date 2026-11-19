"use client";

import { ArrowDown, ArrowUp, FileUp, Monitor, Smartphone, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { importPages, MAX_FILE_MB, MAX_PAGES, type PageImage } from "./import-pages";

type PreviewPage = Omit<PageImage, "image"> & { url: string; unit: "px" | "pt" };

const iconButton =
  "rounded-lg border border-stone-200 p-2 text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-35";
const dimension = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export function CustomInvitationPreview() {
  const [pages, setPages] = useState<PreviewPage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const uploadInProgress = useRef(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
  const urls = useRef(new Set<string>());
  const mounted = useRef(false);
  const uploadDisabled = processing || pages.length >= MAX_PAGES;

  useEffect(() => {
    mounted.current = true;
    const activeUrls = urls.current;
    return () => {
      mounted.current = false;
      for (const url of activeUrls) URL.revokeObjectURL(url);
      activeUrls.clear();
    };
  }, []);

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    void addFiles(files);
  }

  function dragOver(event: DragEvent<HTMLLabelElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = uploadDisabled ? "none" : "copy";
    setDragging(!uploadDisabled);
  }

  function dropFiles(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  }

  async function addFiles(files: File[]) {
    if (!files.length || uploadDisabled || uploadInProgress.current) return;

    uploadInProgress.current = true;
    setProcessing(true);
    setErrors([]);
    const failures: string[] = [];
    let remaining = MAX_PAGES - pages.length;

    try {
      for (const file of files) {
        try {
          const imported = await importPages(file, remaining);
          if (!mounted.current) return;
          const added = imported.map(({ image, ...page }): PreviewPage => {
            const url = URL.createObjectURL(image);
            urls.current.add(url);
            return { ...page, url, unit: /\.pdf$/i.test(file.name) ? "pt" : "px" };
          });
          remaining -= added.length;
          setPages((current) => [...current, ...added]);
        } catch (error) {
          let message = "Không đọc được nội dung file.";
          if (error instanceof Error) {
            if (error.name === "PasswordException")
              message = "PDF có mật khẩu. Hãy mở khóa rồi chọn lại.";
            if (
              /^(PDF vượt|PDF có kích|Không tạo|Không đọc|File vượt|Đã đủ|Chọn file)/.test(
                error.message,
              )
            ) {
              message = error.message;
            }
          }
          failures.push(file.name + " · " + message);
        }
      }
    } finally {
      uploadInProgress.current = false;
      if (mounted.current) {
        setErrors(failures);
        setProcessing(false);
      }
    }
  }

  function move(index: number, direction: -1 | 1) {
    setPages((current) => {
      const destination = index + direction;
      const page = current[index];
      if (!page || destination < 0 || destination >= current.length) return current;
      const next = [...current];
      next.splice(index, 1);
      next.splice(destination, 0, page);
      return next;
    });
  }

  function remove(page: PreviewPage) {
    setPages((current) => current.filter((item) => item.url !== page.url));
    URL.revokeObjectURL(page.url);
    urls.current.delete(page.url);
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#f7f5f0] text-[#27251f]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Import thiết kế thiệp</h1>
        <p className="mt-2 text-sm text-stone-600">
          Chọn file, sắp xếp trang và xem thiệp theo tỷ lệ gốc.
        </p>

        <div className="mt-7 grid items-start gap-5 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
          <section
            aria-labelledby="pages-title"
            className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="pages-title" className="text-base font-semibold">
                Trang thiệp
              </h2>
              <span aria-live="polite" className="text-sm tabular-nums text-stone-500">
                {pages.length} / {MAX_PAGES}
              </span>
            </div>
            <label
              className="mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-center text-[#304736] hover:border-[#304736] hover:bg-[#edf3ee] has-disabled:cursor-not-allowed has-disabled:opacity-60 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[#304736] data-[dragging=true]:border-[#304736] data-[dragging=true]:bg-[#e1eee3]"
              data-dragging={dragging}
              onDragOver={dragOver}
              onDragLeave={() => setDragging(false)}
              onDrop={dropFiles}
            >
              <FileUp size={22} className="pointer-events-none" aria-hidden />
              <span className="pointer-events-none text-sm font-semibold" aria-live="polite">
                {processing
                  ? "Đang xử lý…"
                  : uploadDisabled
                    ? "Đã đủ " + MAX_PAGES + " trang"
                    : dragging
                      ? "Thả file để thêm trang"
                      : "Kéo thả ảnh hoặc PDF vào đây"}
              </span>
              {!uploadDisabled && (
                <span className="pointer-events-none text-xs text-stone-600">
                  hoặc bấm để chọn file
                </span>
              )}
              <input
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.pdf"
                disabled={uploadDisabled}
                aria-label="Chọn ảnh hoặc PDF"
                aria-describedby="import-limits"
                onChange={selectFiles}
                className="pointer-events-none sr-only"
              />
            </label>
            <p id="import-limits" className="mt-2 text-xs text-stone-600">
              JPG, JPEG, PNG, PDF · Tối đa {MAX_FILE_MB} MB mỗi file.
            </p>
            {errors.length > 0 && (
              <ul
                role="alert"
                className="mt-3 space-y-1 rounded-lg bg-red-50 p-3 text-sm break-words text-red-800"
              >
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            )}
            {pages.length > 0 && (
              <ol aria-label="Thứ tự trang" className="mt-4 divide-y divide-stone-100">
                {pages.map((page, index) => (
                  <li key={page.url} className="flex items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p title={page.label} className="truncate text-sm font-medium">
                        {index + 1}. {page.label}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-600">
                        {dimension.format(page.width)} × {dimension.format(page.height)} {page.unit}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={iconButton}
                      disabled={processing || index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={"Đưa trang " + (index + 1) + " lên"}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      className={iconButton}
                      disabled={processing || index === pages.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={"Đưa trang " + (index + 1) + " xuống"}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      type="button"
                      className={iconButton}
                      disabled={processing}
                      onClick={() => remove(page)}
                      aria-label={"Xóa trang " + (index + 1)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section
            aria-labelledby="preview-title"
            className="min-w-0 rounded-2xl border border-stone-200 bg-white"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3 sm:px-5">
              <h2 id="preview-title" className="text-base font-semibold">
                Xem trước
              </h2>
              <div
                className="flex rounded-lg bg-stone-100 p-1"
                aria-label="Chiều rộng xem trước"
                role="group"
              >
                {(
                  [
                    ["desktop", "Desktop", Monitor],
                    ["mobile", "Mobile", Smartphone],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={mode === value}
                    className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-stone-700 aria-pressed:bg-white aria-pressed:shadow-sm"
                    onClick={() => setMode(value)}
                  >
                    <Icon size={14} aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-b-2xl bg-stone-100 p-2 sm:p-5" aria-busy={processing}>
              {pages.length > 0 ? (
                <ol
                  aria-label="Các trang xem trước"
                  className="mx-auto grid w-full gap-2"
                  style={{ maxWidth: mode === "mobile" ? 390 : 680 }}
                >
                  {pages.map((page, index) => (
                    <li
                      key={page.url}
                      className="relative min-w-0 bg-white"
                      style={{ aspectRatio: page.width + " / " + page.height }}
                    >
                      {/* Blob URLs display the original image or the full PDF raster. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={page.url}
                        alt={"Trang " + (index + 1) + " · " + page.label}
                        loading={index > 1 ? "lazy" : "eager"}
                        decoding="async"
                        className="absolute inset-0 block h-full w-full object-contain"
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-600 sm:min-h-96">
                  {processing
                    ? "Đang chuẩn bị trang thiệp…"
                    : "Các trang sẽ hiện ở đây sau khi chọn file."}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
