import { ApiError } from "@/core/api/api-error";

// BE seating rule codes -> what the couple should read. ApiError never carries BE detail text.
const messages: Record<string, string> = {
  TABLE_NUMBER_TAKEN: "Số bàn này đang được một bàn khác dùng. Chọn số khác hoặc đổi số bàn kia trước.",
  TABLE_LIMIT: "Tối đa 100 bàn. Giảm số bàn cần thêm.",
  TABLE_HAS_ASSIGNED_PLACES: "Không thể giảm số ghế xuống dưới số khách đang ngồi ở bàn.",
  INVALID_TABLE_CAPACITY: "Sức chứa bàn phải là 10 hoặc 12 ghế.",
  INVALID_RESERVE_PERCENT: "Tỉ lệ bàn dự phòng phải từ 0 đến 50%.",
  SEATING_EVENT_STARTED: "Tiệc đã bắt đầu, không thể xếp tự động. Hãy chuyển chỗ thủ công.",
  TABLE_CELL_OCCUPIED: "Ô này vừa có bàn khác. Tải lại sơ đồ và chọn ô trống khác.",
  CELL_OUT_OF_LAYOUT: "Vị trí đặt bàn nằm ngoài kích thước sảnh.",
  HALF_REQUIRED: "Cần chọn nửa sảnh nhà trai hoặc nhà gái khi đặt bàn lên sơ đồ.",
  SEAT_OCCUPIED: "Ghế đã có người ngồi hoặc vượt sức chứa bàn.",
  SEAT_UNAVAILABLE: "Ghế đã có người hoặc nằm ngoài sức chứa bàn.",
  TABLE_FULL: "Bàn không đủ chỗ cho cả nhóm.",
  TABLE_OVER_CAPACITY: "Bàn đã đầy chỗ.",
  BOTH_PLACES_IN_TRAY: "Cả hai khách đều chưa được xếp bàn nên không thể đổi chỗ.",
  GUEST_NOT_ATTENDING: "Khách đã từ chối tham dự và chưa check-in nên không thể xếp chỗ.",
  SEATING_PLAN_LOCKED: "Sơ đồ bàn đang khóa. Mở khóa trước khi chỉnh sửa.",
  SEATING_SCOPE_MISMATCH: "Bạn không có quyền xếp khách ngoài nhóm được giao.",
  SEATING_CROSS_GROUP_MOVE_DENIED: "Không thể xếp khách của nhóm khác vào khu vực này.",
  SEATING_TABLE_HAS_OUT_OF_SCOPE_GUESTS:
    "Bàn đang có khách ngoài nhóm được giao; chủ đám cưới cần xử lý trước.",
  SEATING_SOURCE_CHANGED: "Sơ đồ vừa được người khác thay đổi. Đã tải lại, hãy thử lại.",
  NO_SEATING_CHANGES: "Phương án này không thay đổi vị trí nào so với sơ đồ hiện tại.",
  SEATING_SUGGESTION_REQUIRES_WEDDING_SCOPE: "Xếp chỗ tự động yêu cầu quyền chỉnh sửa toàn bộ sơ đồ đám cưới.",
  NO_TABLES: "Chưa có bàn nào trong sơ đồ. Hãy tạo bàn trước khi xếp chỗ.",
  NO_AVAILABLE_SEATS: "Không còn bàn nào đủ chỗ trống cho các khách chưa xếp.",
  EVENT_ALREADY_STARTED: "Tiệc đã được bắt đầu, không thể chỉnh sửa sơ đồ dự kiến.",
  TABLE_NOT_FOUND: "Bàn không còn trên sơ đồ.",
  PLACE_NOT_FOUND: "Khách không còn trong danh sách.",
};

export function seatingErrorText(error: unknown): string | undefined {
  return error instanceof ApiError && error.backendCode ? messages[error.backendCode] : undefined;
}
