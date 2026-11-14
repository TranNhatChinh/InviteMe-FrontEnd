"use client";

import { PanelLeft, Plus } from "lucide-react";
import { useState } from "react";
import {
  SeatingCanvas,
  SeatingSeatBadge,
  SeatingObjectPalette,
  type SeatingCanvasObject,
  type SeatingPlan,
} from "@/features/guests";
import { Modal } from "@/shared/ui/modal";
import { Button } from "@/shared/ui/button";

const tables: SeatingPlan["tables"] = Array.from({ length: 8 }, (_, index) => ({
  id: `sample-${index + 1}`,
  name: `Bàn ${index + 1}`,
  capacity: index % 2 === 0 ? 8 : 10,
  side: index % 4 < 2 ? "BRIDE" : "GROOM",
  row: Math.floor(index / 4) + 1,
  column: (index % 2) + 1,
}));
const plan: SeatingPlan = {
  weddingId: "preview",
  version: 0,
  tables,
  guests: [],
  places: [],
  assignments: [],
};
const guests = [
  { name: "Nguyễn Minh Anh", group: "Gia đình", count: 4 },
  { name: "Trần Thu Hà", group: "VIP", count: 2 },
  { name: "Lê Hoàng Nam", group: "Bạn bè", count: 3 },
  { name: "Phạm Linh Chi", group: "Đồng nghiệp", count: 2 },
];

export function SeatingPreview() {
  const [tables, setTables] = useState(plan.tables);
  const [objects, setObjects] = useState<SeatingCanvasObject[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; capacity: number } | null>(
    null,
  );
  const [unseatedOnly, setUnseatedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [seated, setSeated] = useState<Record<string, string>>({});
  function assign(name: string, tableId: string) {
    const guest = guests.find((item) => item.name === name);
    const table = tables.find((item) => item.id === tableId);
    if (!guest || !table) return;
    setSeated((current) => {
      const occupied = guests
        .filter((item) => item.name !== name && current[item.name] === tableId)
        .reduce((total, item) => total + item.count, 0);
      return occupied + guest.count <= table.capacity ? { ...current, [name]: tableId } : current;
    });
    setSelected(null);
  }

  return (
    <main
      id="main-content"
      className="flex h-dvh flex-col overflow-auto bg-[#faf8f5] lg:overflow-hidden"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3">
        <h1 className="text-2xl font-semibold">Sơ đồ chỗ ngồi</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Dữ liệu mẫu</span>
          <Button
            variant="outline"
            onClick={() => {
              setSeated({});
              setSelected(null);
            }}
          >
            Bỏ xếp khách mẫu
          </Button>
        </div>
      </header>
      <div
        className={`flex min-h-[20rem] flex-1 flex-col overflow-hidden border-t bg-card lg:grid lg:min-h-0 ${sidebarOpen ? "lg:grid-cols-[350px_minmax(0,1fr)] xl:grid-cols-[390px_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)]"}`}
      >
        {sidebarOpen && (
          <aside className="min-h-0 min-w-0 max-h-[30dvh] shrink-0 overflow-auto border-b bg-card lg:max-h-none lg:border-b-0 lg:border-r">
            {paletteOpen ? (
              <SeatingObjectPalette
                onClose={() => setPaletteOpen(false)}
                onTable={() =>
                  setEditing({
                    id: crypto.randomUUID(),
                    name: `Bàn ${tables.length + 1}`,
                    capacity: 10,
                  })
                }
                onObject={(kind) => {
                  const id = crypto.randomUUID();
                  setObjects((current) => [...current, { id, kind }]);
                }}
              />
            ) : (
              <div className="p-5 sm:p-6">
                <div className="mb-3 flex flex-wrap gap-1 rounded-full bg-muted p-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-pressed={!unseatedOnly}
                    className={!unseatedOnly ? "rounded-full bg-white" : "rounded-full"}
                    onClick={() => setUnseatedOnly(false)}
                  >
                    Tất cả ({guests.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-pressed={unseatedOnly}
                    className={unseatedOnly ? "rounded-full bg-white" : "rounded-full"}
                    onClick={() => setUnseatedOnly(true)}
                  >
                    Chưa xếp ({guests.filter((guest) => !seated[guest.name]).length})
                  </Button>
                </div>
                <input
                  aria-label="Tìm khách"
                  placeholder="Tìm khách"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
                />
                <ul className="divide-y border-y">
                  {guests
                    .filter(
                      (guest) =>
                        (!unseatedOnly || !seated[guest.name]) &&
                        guest.name
                          .toLocaleLowerCase("vi")
                          .includes(query.trim().toLocaleLowerCase("vi")),
                    )
                    .map((guest) => (
                      <li key={guest.name}>
                        <button
                          type="button"
                          draggable
                          aria-pressed={selected === guest.name}
                          onClick={() => setSelected(selected === guest.name ? null : guest.name)}
                          onDragStart={(event) =>
                            event.dataTransfer.setData("text/plain", guest.name)
                          }
                          className="flex w-full cursor-grab items-center gap-2 px-2 py-3 text-left text-sm hover:bg-sky-50 aria-pressed:bg-sky-100"
                        >
                          <span
                            aria-hidden="true"
                            className="size-4 shrink-0 rounded border bg-background text-center text-xs"
                          >
                            {selected === guest.name ? "✓" : ""}
                          </span>
                          <span className="min-w-0 flex-1">
                            <strong className="block truncate font-medium">{guest.name}</strong>
                            <span className="text-xs text-muted-foreground">
                              {guest.group} · {guest.count} người
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {tables.find((table) => table.id === seated[guest.name])?.name ??
                              "Chưa xếp"}
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </aside>
        )}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b bg-card px-3 py-3">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="rounded-full bg-muted"
              aria-label="Ẩn hoặc hiện thanh bên"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <PanelLeft className="size-4" />
            </Button>
            <Button
              type="button"
              className="rounded-full bg-stone-950 text-white hover:bg-stone-800"
              aria-expanded={paletteOpen && sidebarOpen}
              onClick={() => {
                setPaletteOpen(!(paletteOpen && sidebarOpen));
                setSidebarOpen(true);
              }}
            >
              <Plus className="size-4" />
              Thêm bàn và đối tượng
            </Button>
          </div>
          <SeatingCanvas
            plan={{ ...plan, tables }}
            objects={objects}
            onRemoveObject={(id) =>
              setObjects((current) => current.filter((item) => item.id !== id))
            }
            editable
            renderTable={(table) => {
              const assigned = guests.filter((guest) => seated[guest.name] === table.id);
              const names = assigned.flatMap((guest) =>
                Array.from({ length: guest.count }, (_, index) =>
                  index === 0 ? guest.name : `Đi cùng ${guest.name}`,
                ),
              );
              const count = names.length;
              return (
                <button
                  type="button"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    assign(event.dataTransfer.getData("text/plain"), table.id);
                  }}
                  aria-haspopup="dialog"
                  onClick={(event) => {
                    if (selected) assign(selected, table.id);
                    else if (
                      event.detail === 0 ||
                      (event.nativeEvent instanceof PointerEvent &&
                        event.nativeEvent.pointerType === "touch")
                    )
                      setEditing({ id: table.id, name: table.name, capacity: table.capacity });
                  }}
                  onDoubleClick={() => {
                    if (!selected)
                      setEditing({ id: table.id, name: table.name, capacity: table.capacity });
                  }}
                  className="relative grid aspect-square w-full place-items-center"
                >
                  {Array.from({ length: table.capacity }, (_, i) => {
                    const angle = (i * 2 * Math.PI) / table.capacity - Math.PI / 2;
                    return (
                      <span
                        key={i}
                        className="absolute size-9 -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: `${50 + 38 * Math.cos(angle)}%`,
                          top: `${50 + 38 * Math.sin(angle)}%`,
                        }}
                      >
                        <SeatingSeatBadge name={names[i]} />
                      </span>
                    );
                  })}
                  <span className="grid size-[57%] content-center rounded-full bg-[#ffa895] text-sm text-stone-950 shadow-sm">
                    <strong>{table.name}</strong>
                    <span>
                      {count}/{table.capacity} ghế
                    </span>
                  </span>
                </button>
              );
            }}
          />
        </section>
      </div>
      {editing && (
        <Modal
          open
          size="side"
          onClose={() => setEditing(null)}
          title={
            tables.some((table) => table.id === editing.id) ? "Chỉnh sửa bàn" : "Thêm bàn tròn"
          }
        >
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              const name = editing.name.trim();
              if (!name) return;
              const existing = tables.some((table) => table.id === editing.id);
              setTables((current) =>
                existing
                  ? current.map((table) =>
                      table.id === editing.id
                        ? { ...table, name, capacity: editing.capacity }
                        : table,
                    )
                  : [...current, { ...editing, name }],
              );
              setEditing(null);
            }}
          >
            <label className="block space-y-1 text-sm">
              Tên bàn
              <input
                required
                maxLength={100}
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                className="block w-full rounded-lg border p-2"
              />
            </label>
            <label className="block space-y-1 text-sm">
              Số ghế
              <input
                type="number"
                required
                min={Math.max(
                  1,
                  guests
                    .filter((guest) => seated[guest.name] === editing.id)
                    .reduce((sum, guest) => sum + guest.count, 0),
                )}
                max={20}
                value={editing.capacity || ""}
                onChange={(event) =>
                  setEditing({ ...editing, capacity: Number(event.target.value) })
                }
                className="block w-full rounded-lg border p-2"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Hủy
              </Button>
              <Button type="submit">Lưu</Button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
