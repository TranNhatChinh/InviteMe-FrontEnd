import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { SeatingBoard } from "../src/features/guests/components/seating-board";
import {
  sideSlots,
  seatingBoardRows,
  nextSeatingTableNumber,
} from "../src/features/guests/utils/seating-layout";
import type { SeatingPlan } from "../src/features/guests/api/planning-seating.api";
import vi from "../src/i18n/locales/vi/guestPlanning.json";

test("adding a table replaces its slot while keeping a common grid and round table renderer", async () => {
  const i18n = createInstance();
  await i18n.init({ lng: "vi", resources: { vi: { guestPlanning: vi } } });
  const plan: SeatingPlan = {
    weddingId: "w",
    version: 0,
    tables: [],
    guests: [],
    places: [],
    assignments: [],
    brideTablesPerRow: 2,
    groomTablesPerRow: 2,
  };
  const render = (value: SeatingPlan) =>
    renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(SeatingBoard, {
          plan: value,
          editable: true,
          saving: false,
          onChange: async () => true,
          onAddSlot: () => {},
          renderTable: (table) =>
            createElement("div", { "data-round-table": table.id }, table.name),
        }),
      ),
    );
  const empty = render(plan);
  assert.equal((empty.match(/data-seating-slot=/g) ?? []).length, 8);
  plan.tables = [{ id: "t", name: "T01", capacity: 10, side: "GROOM", row: 1, column: 2 }];
  const filled = render(plan);
  assert.equal((filled.match(/data-seating-slot=/g) ?? []).length, 8);
  assert.match(filled, /data-round-table="t"/);
  assert.match(filled, /Số bàn mỗi hàng, mỗi bên/);
  assert.doesNotMatch(filled, />Xếp khách<|>Sắp bàn</);
  assert.doesNotMatch(filled, /Nhà gái: bàn\/hàng|Nhà trai: bàn\/hàng/);
  plan.tables.push({ id: "old", name: "Old unpositioned table", capacity: 10 });
  const legacy = render(plan);
  assert.doesNotMatch(legacy, /data-round-table="old"/);
  assert.match(legacy, /Đặt 1 bàn đã có vào sơ đồ/);
});

test("both zones can share the same row count without moving existing slots", () => {
  const tables = [
    { id: "t", name: "T01", capacity: 10, side: "GROOM" as const, row: 3, column: 2 },
  ];
  const bride = sideSlots(tables, "BRIDE", 2, 4),
    groom = sideSlots(tables, "GROOM", 2, 4);
  assert.equal(bride.length, 8);
  assert.equal(groom.length, 8);
  assert.equal(groom[5]?.table?.id, "t");
  assert.equal(bride[5]?.table, undefined);
});

test("filling an existing empty slot does not add rows or move other table positions", () => {
  const tables = ["BRIDE", "GROOM"].flatMap((side) =>
    [1, 2].map((column) => ({
      id: `${side}${column}`,
      name: `${side}${column}`,
      capacity: 10,
      side: side as "BRIDE" | "GROOM",
      row: 1,
      column,
    })),
  );
  const plan: SeatingPlan = {
    weddingId: "w",
    version: 0,
    tables,
    guests: [],
    places: [],
    assignments: [],
    brideTablesPerRow: 2,
    groomTablesPerRow: 2,
  };
  assert.equal(seatingBoardRows(plan), 2);
  plan.tables.push({ id: "fifth", name: "Fifth", capacity: 10, side: "GROOM", row: 2, column: 1 });
  assert.equal(seatingBoardRows(plan), 2);
  assert.equal(sideSlots(plan.tables, "GROOM", 2, seatingBoardRows(plan)).length, 4);
  plan.tables.push({ id: "sixth", name: "Sixth", capacity: 10, side: "GROOM", row: 2, column: 2 });
  assert.equal(seatingBoardRows(plan), 3);
});

test("default table numbers avoid existing names and reuse available numbers", () => {
  const table = (name: string) => ({ id: name, name, capacity: 10 });
  assert.equal(nextSeatingTableNumber([]), 1);
  assert.equal(nextSeatingTableNumber([table("Bàn 1"), table("Bàn 3")]), 2);
  assert.equal(
    nextSeatingTableNumber([table("Bàn 01"), table("Table 2"), table("T03"), table("G01")]),
    4,
  );
  assert.equal(nextSeatingTableNumber([table("Gia đình"), table("Bàn 1")]), 2);
});
