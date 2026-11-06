import type { StoryBuilderV4Document } from "./story-builder-v4.schema";

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
  "Visible pages need a visible section.": "Mỗi trang đang hiển thị cần ít nhất một phần nội dung đang hiển thị.",
  "Section IDs must be unique.": "Các phần nội dung đang bị trùng mã. Hãy tải lại bản mới nhất.",
  "A website may contain at most 80 sections.": "Website chỉ hỗ trợ tối đa 80 phần nội dung.",
};

export function describeV4ValidationIssues(
  issues: readonly ValidationIssue[],
  document: StoryBuilderV4Document,
): string {
  if (issues.length === 0) return "Nội dung website chưa hợp lệ. Hãy kiểm tra lại các trường vừa chỉnh sửa.";

  const details = new Set<string>();
  for (const issue of issues) {
    const globalMessage = documentMessages[issue.message];
    if (globalMessage) {
      details.add(globalMessage);
      continue;
    }

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

    if (context.length > 0) {
      details.add(`${context.join(" → ")}${fieldLabel ? ` → ${fieldLabel}` : ""}: cần kiểm tra lại.`);
    } else if (fieldLabel) {
      details.add(`${fieldLabel}: cần kiểm tra lại.`);
    } else {
      details.add("Một số trường nội dung hoặc liên kết chưa hợp lệ.");
    }
  }

  const messages = [...details];
  const visible = messages.slice(0, 3).join(" ");
  const remaining = messages.length - 3;
  return `Chưa thể lưu hoặc xuất bản. ${visible}${remaining > 0 ? ` Còn ${remaining} vị trí cần kiểm tra.` : ""}`;
}
