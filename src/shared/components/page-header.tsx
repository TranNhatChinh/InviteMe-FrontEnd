"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

const titleKeys: Record<string, string> = {
  "Tài khoản": "accountTitle",
  "Check-in overview": "checkInOverviewTitle",
  "Tổng quan check-in": "checkInOverviewTitle",
  "RSVP reminders": "rsvpRemindersTitle",
  "Nhắc RSVP": "rsvpRemindersTitle",
  "RSVP queue": "rsvpQueueTitle",
  "Hàng chờ RSVP": "rsvpQueueTitle",
  "RSVP responses": "rsvpTitle",
  "Xác nhận tham dự": "rsvpTitle",
  "Co-hosts & access": "coHostsTitle",
  "Co-host và quyền truy cập": "coHostsTitle",
  "Người đồng quản lý và quyền truy cập": "coHostsTitle",
  "Activity history": "activityTitle",
  "Lịch sử hoạt động": "activityTitle",
  "Platform overview": "adminOverviewTitle",
  "Platform audit log": "adminAuditTitle",
  Weddings: "adminWeddingsTitle",
  Templates: "adminTemplatesTitle",
  Accounts: "adminAccountsTitle",
  "Roles & permissions": "rolesTitle",
  Plans: "plansTitle",
  Pricing: "pricingTitle",
  "Your planning space": "dashboardTitle",
};

const descriptionKeys: Record<string, string> = {
  "Quản lý hồ sơ và bảo mật tài khoản InviteMe.": "accountDescription",
  "Số người đã đến được cập nhật lại định kỳ và khi có thay đổi check-in.":
    "checkInOverviewDescription",
  "Theo dõi lịch tự động, nhắc khách chưa phản hồi và xem trạng thái gửi email.":
    "rsvpRemindersDescription",
  "Duyệt yêu cầu đổi câu trả lời và người đi thêm.": "rsvpQueueDescription",
  "Theo dõi câu trả lời và số chỗ của từng thiệp.": "rsvpDescription",
  "Mời người đáng tin cậy và giới hạn quyền của họ theo toàn bộ đám cưới hoặc từng nhóm khách.":
    "coHostsDescription",
  "Mời người bạn tin cậy cùng quản lý đám cưới và giới hạn quyền truy cập theo toàn bộ đám cưới hoặc từng nhóm khách.":
    "coHostsDescription",
  "Theo dõi ai đã thực hiện hành động nào trong đám cưới này.": "activityDescription",
  "InviteMe system activity and administration.": "adminOverviewDescription",
  "Review weddings across InviteMe and filter by owner, title, slug or status.":
    "adminWeddingsDescription",
  "Manage the template registry. Hiding a template preserves its record and existing invitations.":
    "adminTemplatesDescription",
  "Search accounts, manage user access, and assign the platform Admin role. Admin accounts are protected.":
    "adminAccountsDescription",
  "Manage the InviteMe platform.": "plansDescription",
  "Plans for your celebration.": "pricingDescription",
  "A thoughtful overview of your celebrations.": "dashboardDescription",
  "System-wide history of sensitive actions. Metadata is filtered to avoid exposing contact details, tokens or message content.":
    "adminAuditDescription",
};

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const { t } = useTranslation("screens");
  const localizedTitle = titleKeys[title] ? t(titleKeys[title]) : title;
  const localizedDescription =
    description && descriptionKeys[description] ? t(descriptionKeys[description]) : description;
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="break-words font-display text-3xl tracking-tight md:text-4xl">
          {localizedTitle}
        </h1>
        {localizedDescription && (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            {localizedDescription}
          </p>
        )}
      </div>
      {action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}
    </header>
  );
}
