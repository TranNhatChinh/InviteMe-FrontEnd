export const MAX_FILE_MB = 30;
export const MAX_PAGES = 24;

export type PageImage = {
  label: string;
  image: Blob;
  width: number;
  height: number;
};

async function readPdf(file: File, remaining: number): Promise<PageImage[]> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const assets = "/dev/custom-invitation/pdf-assets";
  GlobalWorkerOptions.workerSrc = assets + "/legacy/pdf.worker.min.mjs";
  const loading = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: assets + "/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: assets + "/standard_fonts/",
    wasmUrl: assets + "/wasm/",
    iccUrl: assets + "/iccs/",
    canvasMaxAreaInBytes: 32 * 1024 * 1024,
  });

  try {
    const pdf = await loading.promise;
    if (pdf.numPages > remaining) throw new Error("PDF vượt số trang còn lại.");
    const pages: PageImage[] = [];
    const canvas = document.createElement("canvas");

    try {
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const { width, height } = page.getViewport({ scale: 1 });
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
          throw new Error("PDF có kích thước trang không hợp lệ.");
        }
        // Keep fine text legible at desktop width while bounding the canvas for long designs.
        const scale = Math.min(1600 / width, 4096 / Math.max(width, height));
        const viewport = page.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({
          canvas,
          viewport,
        }).promise;
        const image = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (!image) throw new Error("Không tạo được ảnh từ PDF.");
        pages.push({ label: file.name + " · trang " + number, image, width, height });
        page.cleanup();
      }
      return pages;
    } finally {
      canvas.width = canvas.height = 0;
    }
  } finally {
    await loading.destroy();
  }
}

export async function importPages(file: File, remaining: number): Promise<PageImage[]> {
  if (!remaining) throw new Error("Đã đủ " + MAX_PAGES + " trang.");
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    throw new Error("File vượt " + MAX_FILE_MB + " MB.");
  }

  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf" && new TextDecoder().decode(header).startsWith("%PDF-")) {
    return readPdf(file, remaining);
  }

  const isPng =
    extension === "png" &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte);
  const isJpeg =
    (extension === "jpg" || extension === "jpeg") &&
    header[0] === 255 &&
    header[1] === 216 &&
    header[2] === 255;
  if (!isPng && !isJpeg) throw new Error("Chọn file JPG, JPEG, PNG hoặc PDF hợp lệ.");

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("Không đọc được kích thước ảnh.");
    }
    return [
      { label: file.name, image: file, width: image.naturalWidth, height: image.naturalHeight },
    ];
  } finally {
    URL.revokeObjectURL(url);
  }
}
