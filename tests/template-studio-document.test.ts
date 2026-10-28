import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import path from "node:path";
import burgundyTemplate from "../src/features/template-studio/templates/minimalism-burgundy.json";
import brownTemplate from "../src/features/template-studio/templates/minimalism-brown.json";
import {
  templateCatalog,
  findTemplate,
} from "../src/features/template-studio/templates/catalog";
import { parseStudioDocument } from "../src/features/template-studio/schemas/document";
import {
  resolveStudioText,
  defaultWordingText,
  resolveCoverGreeting,
} from "../src/features/template-studio/components/wording-text";
import {
  calendarMonth,
  countdownParts,
  eventTimestamp,
  isValidEventDate,
} from "../src/features/template-studio/components/date-utils";

function document() {
  return {
    schemaVersion: 1,
    nodes: {
      ROOT: {
        type: { resolvedName: "StudioFrame" },
        isCanvas: true,
        props: { background: "#fffaf1" },
        displayName: "Khung",
        custom: {},
        hidden: false,
        nodes: ["text"],
        linkedNodes: {},
      },
      text: {
        type: { resolvedName: "StudioText" },
        isCanvas: false,
        props: { x: 95, y: 105, text: "Minh & Lan", width: 370, height: 80 },
        displayName: "Chữ",
        custom: {},
        hidden: false,
        nodes: [],
        linkedNodes: {},
        parent: "ROOT",
      },
    },
  };
}

test("wording blocks stay bound across export/import without storing a preview guest", () => {
  const original = document();
  const source = {
    ...original,
    nodes: {
      ...original.nodes,
      text: {
        ...original.nodes.text,
        props: {
          ...original.nodes.text.props,
          textBinding: "invitationWording",
          text: defaultWordingText,
        },
      },
    },
  };
  const saved = JSON.stringify(parseStudioDocument(JSON.stringify(source)));
  const restored = parseStudioDocument(saved);
  const props = restored.nodes.text?.props;
  assert.equal(props?.textBinding, "invitationWording");
  const sampleA = "Kính mời gia đình bác Nguyễn Văn An đến chung vui cùng chúng cháu.";
  const sampleB = "Chị Hoa ơi, đến chung vui cùng chúng em nhé!";
  assert.equal(resolveStudioText(props ?? {}, sampleA), sampleA);
  assert.equal(resolveStudioText(props ?? {}, sampleB), sampleB);
  assert.equal(resolveStudioText(props ?? {}, null), defaultWordingText);
  assert.doesNotMatch(saved, /Nguyễn Văn An|Chị Hoa/);
  assert.equal(resolveStudioText({ text: "Minh & Lan" }, sampleA), "Minh & Lan");
});

test("cover wording binding survives export without copying guest identity", () => {
  const source = document();
  const cover = {
    enabled: true,
    names: "Minh & Lan",
    date: "",
    background: "#681f30",
    greeting: "Thân mời",
    greetingBinding: "invitationWording" as const,
  };
  const saved = JSON.stringify(
    parseStudioDocument(
      JSON.stringify({
        ...source,
        nodes: { ...source.nodes, ROOT: { ...source.nodes.ROOT, props: { cover } } },
      }),
    ),
  );
  const restored = parseStudioDocument(saved).nodes.ROOT!.props.cover!;
  assert.equal(restored.greetingBinding, "invitationWording");
  assert.equal(resolveCoverGreeting(restored, "Kính mời Bác An"), "Kính mời Bác An");
  assert.equal(resolveCoverGreeting(restored, "Thân gửi Chị Hoa"), "Thân gửi Chị Hoa");
  assert.equal(resolveCoverGreeting(restored), defaultWordingText);
  assert.equal(
    resolveCoverGreeting({ ...restored, greetingBinding: undefined }, "Bác An"),
    "Thân mời",
  );
  assert.doesNotMatch(saved, /Bác An|Chị Hoa/);
});

test("wording binding rejects unsupported sources and non-text nodes", () => {
  const original = document();
  const bad = {
    ...original,
    nodes: {
      ...original.nodes,
      text: {
        ...original.nodes.text,
        props: { ...original.nodes.text.props, textBinding: "unsafe-source" },
      },
    },
  };
  assert.throws(() => parseStudioDocument(JSON.stringify(bad)));
  bad.nodes.text.props.textBinding = "invitationWording";
  bad.nodes.text.type.resolvedName = "StudioImage";
  assert.throws(() => parseStudioDocument(JSON.stringify(bad)));
});

test("studio document preserves Vietnamese content and layout across JSON round-trip", () => {
  const input = document();
  assert.deepEqual(parseStudioDocument(JSON.stringify(input)), input);
});

test("studio document rejects broken links and orphan items", () => {
  const broken = document();
  broken.nodes.ROOT.nodes = ["missing"];
  assert.throws(() => parseStudioDocument(JSON.stringify(broken)));
  const orphan = document();
  orphan.nodes.ROOT.nodes = [];
  assert.throws(() => parseStudioDocument(JSON.stringify(orphan)));
});

test("studio document rejects cycles and unsupported component types", () => {
  const cycle = document();
  cycle.nodes.ROOT.nodes.push("ROOT");
  assert.throws(() => parseStudioDocument(JSON.stringify(cycle)));
  const unsupported = document();
  unsupported.nodes.text.type.resolvedName = "UnknownComponent";
  assert.throws(() => parseStudioDocument(JSON.stringify(unsupported)));
});

test("studio document rejects invalid sizes and unsupported schema versions", () => {
  const invalid = document();
  invalid.nodes.text.props.width = -10;
  assert.throws(() => parseStudioDocument(JSON.stringify(invalid)));
  assert.throws(() => parseStudioDocument(JSON.stringify({ ...document(), schemaVersion: 2 })));
});

test("calendar rejects nonexistent dates and aligns a leap month starting on Monday", () => {
  assert.equal(isValidEventDate("2027-02-29"), false);
  assert.equal(isValidEventDate("2028-02-29"), true);
  assert.deepEqual(calendarMonth("2024-02-29"), {
    year: 2024,
    month: 2,
    day: 29,
    offset: 3,
    days: 29,
  });
  assert.equal(calendarMonth("2027-02-30"), null);
});

test("countdown uses the selected timezone rather than the browser timezone", () => {
  assert.equal(
    eventTimestamp("2027-04-18", "17:00", "Asia/Ho_Chi_Minh"),
    Date.parse("2027-04-18T10:00:00Z"),
  );
  assert.equal(eventTimestamp("2027-04-18", "17:00", "UTC"), Date.parse("2027-04-18T17:00:00Z"));
  assert.equal(Number.isNaN(eventTimestamp("2027-04-18", "25:00", "UTC")), true);
  assert.deepEqual(countdownParts(90061000, 0), {
    days: 1,
    hours: 1,
    minutes: 1,
    seconds: 1,
    ended: false,
  });
  assert.deepEqual(countdownParts(1000, 2000), {
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    ended: true,
  });
});

test("calendar and countdown widget settings survive a document round-trip", () => {
  for (const resolvedName of ["StudioCalendar", "StudioCountdown"]) {
    const input = document();
    input.nodes.text.type.resolvedName = resolvedName;
    const props = {
      eventDate: "2028-02-29",
      eventTime: "17:00",
      timezone: "Asia/Ho_Chi_Minh",
      fontFamily: "Georgia",
      accent: "#873b46",
    };
    Object.assign(input.nodes.text.props, props);
    assert.deepEqual(parseStudioDocument(JSON.stringify(input)), input);
    Object.assign(input.nodes.text.props, { eventDate: "2027-02-29" });
    assert.throws(() => parseStudioDocument(JSON.stringify(input)));
  }
});

test("Minimalism Brown loads as an editable document using InviteMe widgets and existing local assets", () => {
  const document = parseStudioDocument(JSON.stringify(brownTemplate));
  const kinds = new Set<string>(
    Object.values(document.nodes).map((node) => node.type.resolvedName),
  );
  for (const type of ["StudioCalendar", "StudioMap", "StudioAlbum", "StudioAction", "StudioWishes"])
    assert.ok(kinds.has(type));
  assert.equal(document.nodes.ROOT?.props.width, 480);
  assert.equal(document.nodes.ROOT?.props.height, 3680);
  for (const node of Object.values(document.nodes)) {
    for (const src of [node.props.src, ...(node.props.images ?? [])]) {
      if (src)
        assert.ok(existsSync(path.join(process.cwd(), "public", src)), `Missing asset: ${src}`);
    }
  }
});

test("album supports uploaded asset references and variable image counts", () => {
  const input = structuredClone(brownTemplate);
  const album = Object.values(input.nodes).find(
    (node) => node.type.resolvedName === "StudioAlbum",
  )!;
  const uploaded = "/api/template-studio/assets?id=12345678-1234-1234-1234-123456789abc";
  Object.assign(album.props, { images: Array(25).fill(uploaded) });
  const result = parseStudioDocument(JSON.stringify(input));
  assert.equal(
    Object.values(result.nodes).find((node) => node.type.resolvedName === "StudioAlbum")!.props
      .images!.length,
    25,
  );
  Object.assign(album.props, { images: ["javascript:alert(1)"] });
  assert.throws(() => parseStudioDocument(JSON.stringify(input)));
});

test("reveal presets round-trip with per-item overrides and reject invalid motion settings", () => {
  const input = structuredClone(brownTemplate);
  Object.assign(input.nodes.ROOT.props, { revealPreset: "slide-up", revealDuration: 800 });
  const image = Object.values(input.nodes).find(
    (node) => node.type.resolvedName === "StudioImage",
  )!;
  Object.assign(image.props, { revealPreset: "none", revealDelay: 150 });
  const saved = parseStudioDocument(JSON.stringify(input));
  assert.equal(saved.nodes.ROOT!.props.revealPreset, "slide-up");
  assert.equal(
    Object.values(saved.nodes).find((node) => node.type.resolvedName === "StudioImage")!.props
      .revealPreset,
    "none",
  );
  Object.assign(input.nodes.ROOT.props, { revealDuration: -1 });
  assert.throws(() => parseStudioDocument(JSON.stringify(input)));
  Object.assign(input.nodes.ROOT.props, { revealDuration: 800, revealPreset: "unknown" });
  assert.throws(() => parseStudioDocument(JSON.stringify(input)));
});

test("burgundy template uses shared widgets and original local assets", () => {
  const value = parseStudioDocument(JSON.stringify(burgundyTemplate));
  assert.equal(value.nodes.ROOT!.props.revealPreset, "fade");
  const names = Object.values(value.nodes).map((node) => node.type.resolvedName);
  for (const name of ["StudioAlbum", "StudioCalendar", "StudioMap", "StudioAction", "StudioWishes"])
    assert.ok(names.includes(name as (typeof names)[number]));
  for (const node of Object.values(value.nodes)) {
    for (const src of [node.props.src, ...(node.props.images ?? [])].filter(
      (src): src is string => !!src,
    )) {
      assert.ok(src.startsWith("/images/template-studio/minimalism-burgundy/"));
      assert.ok(existsSync(path.join(process.cwd(), "public", src)));
    }
  }
});

test("cover is optional and preserves template node positions", () => {
  const value = parseStudioDocument(JSON.stringify(burgundyTemplate));
  assert.equal(value.nodes.ROOT!.props.cover!.enabled, true);
  const positions = Object.values(value.nodes).map((node) => [
    node.props.x,
    node.props.y,
    node.props.width,
    node.props.height,
  ]);
  delete value.nodes.ROOT!.props.cover;
  const without = parseStudioDocument(JSON.stringify(value));
  assert.deepEqual(
    Object.values(without.nodes).map((node) => [
      node.props.x,
      node.props.y,
      node.props.width,
      node.props.height,
    ]),
    positions,
  );
  const invalid = structuredClone(burgundyTemplate);
  Object.assign(invalid.nodes.ROOT.props.cover, { background: "url(javascript:alert(1))" });
  assert.throws(() => parseStudioDocument(JSON.stringify(invalid)));
});

test("cover appearance, particles and opening animation survive JSON round-trip", () => {
  const input = structuredClone(burgundyTemplate);
  Object.assign(input.nodes.ROOT.props.cover, {
    style: "traditional",
    particles: "happiness",
    opening: "fly",
  });
  const saved = parseStudioDocument(JSON.stringify(input));
  assert.equal(saved.nodes.ROOT!.props.cover!.opening, "fly");
  assert.equal(saved.nodes.ROOT!.props.cover!.particles, "happiness");
  Object.assign(input.nodes.ROOT.props.cover, { opening: "invalid" });
  assert.throws(() => parseStudioDocument(JSON.stringify(input)));
});

test("all 15 catalog templates round-trip, use shared widgets and resolve original assets", () => {
  assert.equal(templateCatalog.length, 15);
  assert.equal(new Set(templateCatalog.map((item) => item.id)).size, 15);
  for (const template of templateCatalog) {
    const doc = parseStudioDocument(JSON.stringify(template.document));
    assert.equal(findTemplate(template.id)?.name, template.name);
    const kinds = Object.values(doc.nodes).map((node) => node.type.resolvedName);
    for (const kind of [
      "StudioAlbum",
      "StudioCalendar",
      "StudioMap",
      "StudioAction",
      "StudioWishes",
    ])
      assert.ok(kinds.includes(kind as (typeof kinds)[number]), `${template.id}: ${kind}`);
    for (const node of Object.values(doc.nodes)) {
      for (const src of [
        node.props.src,
        node.props.cover?.decoration,
        ...(node.props.images ?? []),
      ]) {
        if (!src) continue;
        assert.ok(!src.includes("minimalism-brown/"), `${template.id}: copied asset ${src}`);
        assert.ok(
          existsSync(path.join(process.cwd(), "public", src)),
          `${template.id}: missing ${src}`,
        );
      }
      if (!["StudioImage", "StudioText", "StudioFrame"].includes(node.type.resolvedName)) {
        assert.ok((node.props.x ?? 0) >= 0);
        assert.ok((node.props.x ?? 0) + (node.props.width ?? 0) <= doc.nodes.ROOT!.props.width!);
        assert.ok((node.props.y ?? 0) + (node.props.height ?? 0) <= doc.nodes.ROOT!.props.height!);
      }
    }
  }
  assert.equal(findTemplate("unknown"), undefined);
});

test("optional image shapes preserve older documents and reject unsupported shapes", () => {
  const input = structuredClone(brownTemplate);
  const photo = Object.values(input.nodes).find(
    (node) => node.type.resolvedName === "StudioImage",
  )!;
  Object.assign(photo.props, { imageShape: "arch" });
  assert.equal(
    Object.values(parseStudioDocument(JSON.stringify(input)).nodes).find(
      (node) => node.type.resolvedName === "StudioImage",
    )!.props.imageShape,
    "arch",
  );
  Object.assign(photo.props, { imageShape: "arbitrary-css" });
  assert.throws(() => parseStudioDocument(JSON.stringify(input)));
});
