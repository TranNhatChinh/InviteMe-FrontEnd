import { z } from "zod";

export const groupKind = z.enum([
  "RELATIVES",
  "FRIENDS",
  "COLLEAGUES",
  "PARTNERS",
  "NEIGHBORS",
  "OTHER",
  "FAMILY",
  "VIP",
]);
export const groupLabels: Record<z.infer<typeof groupKind>, string> = {
  FAMILY: "Gia đình",
  VIP: "Khách quan trọng",
  RELATIVES: "Họ hàng",
  FRIENDS: "Bạn bè",
  COLLEAGUES: "Đồng nghiệp",
  PARTNERS: "Đối tác",
  NEIGHBORS: "Hàng xóm",
  OTHER: "Khác",
};
