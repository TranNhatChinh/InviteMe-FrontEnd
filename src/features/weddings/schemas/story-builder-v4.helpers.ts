import type { StoryBuilderV4Document } from "./story-builder-v4.schema";

const imageFileExtension = /\.(?:jpe?g|png|webp|gif|avif|heic)(?:[?#].*)?$/i;

/** Uploaded source filenames are storage details, not visitor-facing image descriptions. */
export function isImageFilename(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && imageFileExtension.test(normalized);
}

export function moveV4Page(
  pages: StoryBuilderV4Document["pages"],
  index: number,
  direction: -1 | 1,
): StoryBuilderV4Document["pages"] {
  const destination = index + direction;
  if (
    index < 0 ||
    destination >= pages.length ||
    destination < 0 ||
    pages[index]?.isHome ||
    pages[destination]?.isHome
  ) {
    return pages;
  }

  const reordered = [...pages];
  const current = reordered[index];
  const adjacent = reordered[destination];
  if (!current || !adjacent) return pages;
  reordered[index] = adjacent;
  reordered[destination] = current;
  return reordered;
}

type ValidationIssue = {
  path: readonly PropertyKey[];
  message: string;
};

const sectionLabels: Record<string, string> = {
  hero: "Ảnh bìa",
  couple: "Cặp đôi",
  countdown: "Đếm ngược",
  loveStory: "Chuyện tình",
  events: "Sự kiện",
  gallery: "Album ảnh",
  rsvp: "Xác nhận tham dự",
  wishes: "Lời chúc",
  gift: "Mừng cưới",
};

const fieldLabels: Record<string, string> = {
  slug: "đường dẫn trang",
  title: "tiêu đề",
  navigationLabel: "tên hiển thị trong điều hướng",
  imageUrl: "ảnh",
  photoUrl: "ảnh chân dung",
  images: "danh sách ảnh",
  items: "danh sách dấu mốc",
  events: "danh sách sự kiện",
  startsAt: "ngày giờ",
  targetDate: "ngày đếm ngược",
  mapUrl: "liên kết bản đồ",
  visible: "trạng thái hiển thị",
  sections: "các phần nội dung",
  id: "mã nội dung",
  intro: "lời giới thiệu",
  subtitle: "lời dẫn",
  eyebrow: "dòng nhấn",
  ctaLabel: "nhãn nút",
  submitLabel: "nhãn nút xác nhận",
  displayName: "tên hiển thị",
  fullName: "họ tên",
  bio: "lời giới thiệu",
  body: "mô tả",
  alt: "mô tả ảnh",
  name: "tên",
  role: "vai trò",
  description: "mô tả",
};

const documentMessages: Record<string, string> = {
  "Website content exceeds 200 KB.": "Nội dung website vượt quá giới hạn. Hãy rút gọn nội dung hoặc giảm số lượng ảnh.",
  "Exactly one home page must use an empty slug.": "Website cần có đúng một trang chủ với đường dẫn gốc.",
  "One-page websites must have exactly one page.": "Chế độ một trang chỉ cho phép một trang.",
  "Multi-page websites need at least two pages.": "Chế độ nhiều trang cần ít nhất hai trang.",
  "Page IDs must be unique.": "Các trang đang bị trùng mã. Hãy tải lại bản mới nhất.",
  "Page paths must be unique.": "Đường dẫn của các trang không được trùng nhau.",
  "Page path must use a safe, unreserved slug.": "Đường dẫn trang chỉ dùng chữ thường, số và dấu gạch ngang; tránh các địa chỉ dành riêng.",
  "The visible hero must be the first section.": "Ảnh bìa phải nằm ở đầu mỗi trang.",
  "A page may have only one visible hero section.": "Mỗi trang chỉ được có một phần ảnh bìa đang hiển thị.",
  "The home page must be visible.": "Trang chủ đang bị ẩn. Hãy bật hiển thị trang chủ trước khi xuất bản.",
  "At least one page must be visible.": "Website cần có ít nhất một trang đang hiển thị.",
  "Visible pages need a visible section.": "Mỗi trang đang hiển thị cần ít nhất một phần nội dung đang hiển thị.",
  "Section IDs must be unique.": "Các phần nội dung đang bị trùng mã. Hãy tải lại bản mới nhất.",
  "A website may contain at most 80 sections.": "Website chỉ hỗ trợ tối đa 80 phần nội dung.",
  "Selected color palette is not part of this template.": "Bảng màu đã chọn không còn thuộc mẫu này. Hãy chọn lại bảng màu trong phần Kiểu hiển thị.",
  "Selected heading font is not supported by this template.": "Phông tiêu đề đã chọn không còn được mẫu hỗ trợ. Hãy chọn phông khác trong phần Kiểu hiển thị.",
  "Selected body font is not supported by this template.": "Phông nội dung đã chọn không còn được mẫu hỗ trợ. Hãy chọn phông khác trong phần Kiểu hiển thị.",
};

export function describeV4Issue(issue: ValidationIssue): string {
  const known = documentMessages[issue.message];
  if (known) return known;
  const detail = issue as ValidationIssue & { code?: string; maximum?: number; minimum?: number; origin?: string; format?: string };
  if (detail.code === "too_big" && typeof detail.maximum === "number") {
    const unit = detail.origin === "array" ? "mục" : "ký tự";
    return `Vượt quá giới hạn ${detail.maximum} ${unit}.`;
  }
  if (detail.code === "too_small" && typeof detail.minimum === "number") {
    const unit = detail.origin === "array" ? "mục" : "ký tự";
    return `Cần có ít nhất ${detail.minimum} ${unit}.`;
  }
  if (detail.code === "invalid_format") {
    if (detail.format === "url") return "Liên kết không đúng định dạng hoặc không dùng HTTPS.";
    if (detail.format === "datetime") return "Ngày giờ không hợp lệ. Hãy chọn lại thời điểm.";
    return "Giá trị không đúng định dạng.";
  }
  if (detail.code === "invalid_value") return "Giá trị không nằm trong các lựa chọn được hỗ trợ.";
  if (detail.code === "invalid_type") return "Giá trị chưa đúng kiểu dữ liệu.";
  if (issue.message.includes("Ảnh phải thuộc") || issue.message.includes("Liên kết phải dùng HTTPS")) return issue.message;
  return "Nội dung chưa hợp lệ. Hãy kiểm tra trường này.";
}

export function describeV4ValidationIssues(
  issues: readonly ValidationIssue[],
  document: StoryBuilderV4Document,
): string {
  if (issues.length === 0) return "Nội dung website chưa hợp lệ. Hãy kiểm tra lại các trường vừa chỉnh sửa.";

  const details = new Set<string>();
  for (const issue of issues) {
    const pagePosition = issue.path.indexOf("pages");
    const pageIndex = pagePosition >= 0 ? issue.path[pagePosition + 1] : undefined;
    const page = typeof pageIndex === "number" ? document.pages[pageIndex] : undefined;
    const sectionPosition = issue.path.indexOf("sections");
    const sectionIndex = sectionPosition >= 0 ? issue.path[sectionPosition + 1] : undefined;
    const section = page && typeof sectionIndex === "number" ? page.sections[sectionIndex] : undefined;
    const field = [...issue.path].reverse().find((part): part is string => typeof part === "string");
    const fieldLabel = field ? fieldLabels[field] : undefined;
    const context = [
      page ? `Trang “${page.title}”` : undefined,
      section ? sectionLabels[section.type] ?? "Phần nội dung" : undefined,
    ].filter(Boolean);
    const reason = describeV4Issue(issue);

    if (context.length > 0) {
      details.add(`${context.join(" → ")}${fieldLabel ? ` → ${fieldLabel}` : ""}: ${reason}`);
    } else if (fieldLabel) {
      details.add(`${fieldLabel}: ${reason}`);
    } else {
      details.add(reason);
    }
  }

  const messages = [...details];
  const visible = messages.slice(0, 3).join(" ");
  const remaining = messages.length - 3;
  return `Chưa thể lưu hoặc xuất bản. ${visible}${remaining > 0 ? ` Còn ${remaining} vị trí cần kiểm tra.` : ""}`;
}
