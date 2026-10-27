export const MAX_MESSAGE_RECIPIENTS = 5000;

export type MessageRecipient = {
  id: string;
  recipientName: string;
  groupName?: string | null;
  email?: string | null;
  phone?: string | null;
};

type RecipientPage<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
};

export async function loadAllMessageRecipients<T extends { id: string }>(
  loadPage: (page: number) => Promise<RecipientPage<T>>,
): Promise<T[]> {
  const first = await loadPage(1);
  if (first.totalItems > MAX_MESSAGE_RECIPIENTS) throw new Error("RECIPIENT_LIMIT_EXCEEDED");
  if (first.pageSize <= 0) throw new Error("INVALID_RECIPIENT_PAGE");
  const totalPages = Math.ceil(first.totalItems / first.pageSize);
  const items = [...first.items];
  // Bound concurrency rather than requesting an entire wedding's pages at once.
  for (let page = 2; page <= totalPages; page += 4) {
    const pages = await Promise.all(
      Array.from({ length: Math.min(4, totalPages - page + 1) }, (_, index) =>
        loadPage(page + index),
      ),
    );
    if (pages.some((result) => result.totalItems !== first.totalItems))
      throw new Error("RECIPIENT_LIST_CHANGED");
    items.push(...pages.flatMap((result) => result.items));
  }
  const unique = new Map(items.map((item) => [item.id, item]));
  if (unique.size !== first.totalItems) throw new Error("RECIPIENT_LIST_CHANGED");
  return [...unique.values()];
}

export function toggleRecipientPage(selectedIds: string[], pageIds: string[], checked: boolean) {
  const selected = new Set(selectedIds);
  for (const id of pageIds) {
    if (checked) selected.add(id);
    else selected.delete(id);
  }
  return [...selected];
}

export function missingRecipientContacts(
  recipients: MessageRecipient[],
  selectedIds: string[],
  channels: string[],
) {
  const byId = new Map(recipients.map((guest) => [guest.id, guest]));
  return selectedIds.filter((id) => {
    const guest = byId.get(id);
    return (
      !guest ||
      (channels.includes("EMAIL") && !guest.email?.trim()) ||
      (channels.includes("SMS") && !guest.phone?.trim())
    );
  });
}
