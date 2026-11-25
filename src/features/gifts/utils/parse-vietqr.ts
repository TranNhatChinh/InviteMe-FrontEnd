export type ParsedVietQr = {
  raw: string;
  bankBin?: string;
  accountNumber?: string;
  amount?: string;
  content?: string;
};

type TlvMap = Record<string, string>;

function parseTlv(input: string): TlvMap {
  const result: TlvMap = {};
  let index = 0;
  while (index + 4 <= input.length) {
    const tag = input.slice(index, index + 2);
    const lengthStr = input.slice(index + 2, index + 4);
    const length = Number.parseInt(lengthStr, 10);
    if (!Number.isFinite(length) || length < 0 || index + 4 + length > input.length) {
      break;
    }
    result[tag] = input.slice(index + 4, index + 4 + length);
    index += 4 + length;
  }
  return result;
}

/**
 * Parses an EMVCo VietQR payload string into bank BIN, account number, amount, and transfer content.
 */
export function parseVietQrPayload(raw: string): ParsedVietQr {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("0002")) {
    return { raw: trimmed, content: trimmed };
  }

  const root = parseTlv(trimmed);
  let bankBin: string | undefined;
  let accountNumber: string | undefined;

  // Tag 38 holds VietQR beneficiary info; sub-tag 01 holds bank BIN (00) + account number (01)
  if (root["38"]) {
    const merchantInfo = parseTlv(root["38"]);
    if (merchantInfo["01"]) {
      const beneficiary = parseTlv(merchantInfo["01"]);
      bankBin = beneficiary["00"];
      accountNumber = beneficiary["01"];
    }
  }

  const amount = root["54"];
  let content: string | undefined;
  if (root["62"]) {
    const additional = parseTlv(root["62"]);
    content = additional["08"];
  }

  return {
    raw: trimmed,
    bankBin,
    accountNumber,
    amount,
    content,
  };
}

type BarcodeDetectorLike = {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

/**
 * Decodes a QR code image file/blob in the browser using BarcodeDetector with white quiet-zone padding.
 */
export async function decodeVietQrImage(file: Blob): Promise<ParsedVietQr> {
  const Detector = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
  if (!Detector) {
    throw new Error(
      "Trình duyệt hiện tại chưa hỗ trợ đọc ảnh QR trực tiếp (khuyên dùng Chrome hoặc Edge).",
    );
  }

  const bitmap = await createImageBitmap(file);
  try {
    const pad = 24;
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width + pad * 2;
    canvas.height = bitmap.height + pad * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Không thể khởi tạo canvas để đọc ảnh QR.");
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, pad, pad);

    const detector = new Detector({ formats: ["qr_code"] });
    const barcodes = await detector.detect(canvas);
    const rawValue = barcodes.find((b) => b.rawValue)?.rawValue;
    if (!rawValue) {
      throw new Error("Không tìm thấy mã QR hợp lệ trong ảnh này.");
    }
    return parseVietQrPayload(rawValue);
  } finally {
    bitmap.close();
  }
}
