import type { ItemProps } from "../components/items";
import { parseStudioDocument } from "../schemas/document";
import brown from "./minimalism-brown.json";
import burgundy from "./minimalism-burgundy.json";

const base = "/images/template-studio/collection/";
const garden = `${base}photo-garden.webp`;
const red = `${base}photo-traditional.webp`;
const flowers = `${base}magnolia.webp`;
const pink = `${base}rose-paper.webp`;
const royal = `${base}dragon-phoenix.webp`;
type Layout =
  | "arch"
  | "botanical"
  | "envelope"
  | "scallop"
  | "floral-names"
  | "glass"
  | "silk"
  | "polaroid"
  | "royal-arch"
  | "phoenix"
  | "portraits"
  | "royal-names";
type Recipe = {
  id: string;
  name: string;
  reference: string;
  description: string;
  layout: Layout;
  background: string;
  ink: string;
  accent: string;
  names: [string, string];
  date: string;
  heroHeight: number;
  albumCount: number;
  ceremony: "center" | "offset" | "glass";
  reception: "center" | "offset";
};

// Recipes are authoring data. Every entry produces a standalone Craft document;
// renderer, editor, widgets, cover and motion stay shared across the collection.
const recipes: Recipe[] = [
  {
    id: "song-hy-xanh",
    name: "Song Hỷ · Xanh",
    reference: "song-hy-xanh",
    description: "Chữ hỷ, mảng xanh cung tròn và ảnh vòm.",
    layout: "arch",
    background: "#fff8ed",
    ink: "#25402b",
    accent: "#153322",
    names: ["Hải Nam", "Khánh Linh"],
    date: "2026-07-30",
    heroHeight: 700,
    albumCount: 6,
    ceremony: "center",
    reception: "center",
  },
  {
    id: "hoa-moc-xanh",
    name: "Hoa Mộc · Xanh",
    reference: "hoa-moc-xanh",
    description: "Hoa trắng, hai ảnh nghiêng và dải lá ngang.",
    layout: "botanical",
    background: "#fffbf6",
    ink: "#456033",
    accent: "#496737",
    names: ["Minh Quân", "Thu Hà"],
    date: "2026-05-24",
    heroHeight: 760,
    albumCount: 7,
    ceremony: "offset",
    reception: "offset",
  },
  {
    id: "song-hy-do",
    name: "Song Hỷ · Đỏ",
    reference: "song-hy-do",
    description: "Chữ hỷ kem trên cung đỏ, ảnh áo dài khung vòm.",
    layout: "arch",
    background: "#fff8ed",
    ink: "#8e161e",
    accent: "#970e19",
    names: ["Gia Khánh", "Quỳnh Anh"],
    date: "2026-06-14",
    heroHeight: 700,
    albumCount: 6,
    ceremony: "center",
    reception: "center",
  },
  {
    id: "minimalism-xanh",
    name: "Minimalism · Xanh",
    reference: "minimalism-xanh",
    description: "Phong bì xanh, hai ảnh Polaroid và lá mờ.",
    layout: "envelope",
    background: "#fffefa",
    ink: "#526441",
    accent: "#6c8055",
    names: ["Đăng Khoa", "Mỹ Duyên"],
    date: "2026-11-22",
    heroHeight: 700,
    albumCount: 6,
    ceremony: "center",
    reception: "center",
  },
  {
    id: "song-hy-v2-do",
    name: "Song Hỷ V2 · Đỏ",
    reference: "song-hy-v2-do",
    description: "Giấy kem, ảnh cạnh bậc và đường cong vàng.",
    layout: "scallop",
    background: "#fff7e5",
    ink: "#9e1a20",
    accent: "#a30a15",
    names: ["Trung Hiếu", "Thanh Hà"],
    date: "2026-12-06",
    heroHeight: 740,
    albumCount: 5,
    ceremony: "center",
    reception: "center",
  },
  {
    id: "mai-lan-trang",
    name: "Mai Lan · Trắng",
    reference: "mai-lan-trang",
    description: "Tên đôi trong khung hoa vòm olive; ảnh nằm sau lễ cưới.",
    layout: "floral-names",
    background: "#fffaf7",
    ink: "#404a1d",
    accent: "#65713e",
    names: ["Văn Long", "Thu Hà"],
    date: "2026-10-25",
    heroHeight: 640,
    albumCount: 5,
    ceremony: "center",
    reception: "center",
  },
  {
    id: "vuonkinh-hong",
    name: "Vườn Kính · Hồng",
    reference: "vuonkinh-hong",
    description: "Nền hoa hồng, tên trong kính oval và tấm kính lớn.",
    layout: "glass",
    background: "#fff5f3",
    ink: "#a44f64",
    accent: "#b97082",
    names: ["Ngọc Hân", "Đức Anh"],
    date: "2026-12-20",
    heroHeight: 590,
    albumCount: 8,
    ceremony: "glass",
    reception: "center",
  },
  {
    id: "to-duyen-xanh",
    name: "Tơ Duyên · Xanh",
    reference: "to-duyen-xanh",
    description: "Hai ảnh so le, hoa rum và dải lụa uốn giữa các phần.",
    layout: "silk",
    background: "#fffffb",
    ink: "#647340",
    accent: "#91a05d",
    names: ["Hoài Nam", "An Nhiên"],
    date: "2027-03-07",
    heroHeight: 720,
    albumCount: 7,
    ceremony: "offset",
    reception: "offset",
  },
  {
    id: "minimalism-nau-dam",
    name: "Minimalism · Nâu đậm",
    reference: "minimalism-nau-dam",
    description: "Một ảnh Polaroid trong phong bì, hoa nâu và giấy ngà.",
    layout: "polaroid",
    background: "#f8f3e9",
    ink: "#614638",
    accent: "#79604c",
    names: ["Xuân Trường", "Ngọc Mai"],
    date: "2026-12-12",
    heroHeight: 720,
    albumCount: 6,
    ceremony: "center",
    reception: "center",
  },
  {
    id: "long-phung-v3-do",
    name: "Long Phụng V3 · Đỏ",
    reference: "long-phung-v3-do",
    description: "Ảnh cạnh bậc trên nền đỏ thẫm, long phụng và én vàng.",
    layout: "royal-arch",
    background: "#7e1026",
    ink: "#f9dfb2",
    accent: "#a93b41",
    names: ["Tuấn Kiệt", "Thanh Hà"],
    date: "2026-07-12",
    heroHeight: 720,
    albumCount: 6,
    ceremony: "center",
    reception: "center",
  },
  {
    id: "song-phung-do",
    name: "Song Phụng · Đỏ",
    reference: "song-phung-do",
    description: "Tên phía trên, đôi phụng quanh chữ hỷ trên dải đỏ.",
    layout: "phoenix",
    background: "#fff1e6",
    ink: "#8f161b",
    accent: "#8d111b",
    names: ["Ngọc Ánh", "Thế Bảo"],
    date: "2026-11-15",
    heroHeight: 680,
    albumCount: 5,
    ceremony: "center",
    reception: "center",
  },
  {
    id: "song-long-do",
    name: "Song Long · Đỏ",
    reference: "song-long-do",
    description: "Hai chân dung tròn, chữ hỷ ở giữa và dải rồng đỏ.",
    layout: "portraits",
    background: "#f3e4d8",
    ink: "#963b36",
    accent: "#913331",
    names: ["Hoàng Nam", "Thanh Tú"],
    date: "2026-11-29",
    heroHeight: 470,
    albumCount: 6,
    ceremony: "center",
    reception: "center",
  },
  {
    id: "long-phung-v2-do",
    name: "Long Phụng V2 · Đỏ",
    reference: "long-phung-v2-do",
    description: "Tên vàng và long phụng lớn trên nền đỏ, không ảnh đầu.",
    layout: "royal-names",
    background: "#7b171a",
    ink: "#f7dba4",
    accent: "#9e3b35",
    names: ["Trung Hiếu", "Minh Nguyệt"],
    date: "2026-12-27",
    heroHeight: 690,
    albumCount: 8,
    ceremony: "center",
    reception: "center",
  },
];

type Document = ReturnType<typeof parseStudioDocument>;
type NodeName = Document["nodes"][string]["type"]["resolvedName"];
function compose(recipe: Recipe): Document {
  const nodes: Document["nodes"] = {};
  const ids: string[] = [];
  let counter = 0;
  const add = (type: NodeName, props: ItemProps, label: string) => {
    const id = `${recipe.id}-${++counter}`;
    ids.push(id);
    nodes[id] = {
      type: { resolvedName: type },
      isCanvas: false,
      props,
      displayName: label,
      custom: {},
      hidden: false,
      nodes: [],
      linkedNodes: {},
      parent: "ROOT",
    };
  };
  const text = (
    value: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize = 24,
    extra: ItemProps = {},
  ) =>
    add(
      "StudioText",
      {
        text: value,
        x,
        y,
        width,
        height,
        fontSize,
        color: recipe.ink,
        fontFamily: "EB Garamond",
        textAlign: "center",
        lineHeight: 1.25,
        ...extra,
      },
      value || "Mảng trang trí",
    );
  const panel = (
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    radius = 0,
    opacity = 1,
  ) =>
    text("", x, y, width, height, 16, {
      background: color,
      borderRadius: radius,
      opacity,
      revealPreset: "none",
    });
  const image = (
    src: string,
    x: number,
    y: number,
    width: number,
    height: number,
    extra: ItemProps = {},
  ) =>
    add(
      "StudioImage",
      { src, x, y, width, height, objectFit: "contain", ...extra },
      src.includes("photo-") ? "Ảnh cưới AI" : "Trang trí riêng",
    );
  const photo = (
    src: string,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation = 0,
    imageShape: ItemProps["imageShape"] = "rectangle",
  ) => image(src, x, y, width, height, { rotation, imageShape, objectFit: "cover" });
  const polaroid = (
    src: string,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number,
  ) => {
    panel(x - 6, y - 6, width + 12, height + 25, "#ffffff");
    const lastId = ids.at(-1);
    const last = lastId ? nodes[lastId] : undefined;
    if (last) last.props.rotation = rotation;
    photo(src, x, y, width, height, rotation);
  };
  const dark = ["royal-arch", "royal-names"].includes(recipe.layout);
  const heroPhoto = recipe.id.includes("do") ? red : garden;
  const names = recipe.names;
  const floral = ["botanical", "envelope", "floral-names", "silk"].includes(recipe.layout);
  const botanical = recipe.layout === "silk" ? `${base}calla.webp` : flowers;
  let glassPanel: string | undefined;
  if (recipe.layout === "glass") {
    panel(15, 570, 450, 3600, "#ffffff", 30, 0.8);
    glassPanel = ids[ids.length - 1];
  }
  if (floral)
    image(botanical, -5, 0, 250, 400, {
      opacity: recipe.layout === "envelope" ? 0.18 : 0.7,
      revealPreset: "none",
    });

  switch (recipe.layout) {
    case "arch":
      panel(0, -220, 480, 470, recipe.accent, 240);
      text("WELCOME TO OUR WEDDING", 40, 35, 400, 30, 14, { color: "#f9e4bb" });
      text(names[0].toUpperCase(), 25, 85, 155, 45, 22, { color: "#f9e4bb" });
      text("囍", 185, 65, 110, 95, 72, { color: "#f9e4bb" });
      text(names[1].toUpperCase(), 300, 85, 155, 45, 22, { color: "#f9e4bb" });
      text("LOVE NEVER FAILS", 80, 170, 320, 40, 18, { color: "#f9e4bb" });
      photo(heroPhoto, 130, 210, 220, 390, 0, "arch");
      break;
    case "botanical":
      image(botanical, 250, 0, 230, 220);
      panel(0, 300, 480, 85, recipe.accent);
      polaroid(garden, 108, 145, 135, 220, -15);
      polaroid(red, 270, 335, 125, 200, 13);
      text(names[0], 275, 232, 180, 65, 32);
      text(names[1], 50, 418, 180, 65, 32);
      image(botanical, -5, 510, 210, 200, { flipX: true });
      break;
    case "envelope":
    case "polaroid":
      text("SAVE THE DATE", 40, 30, 400, 38, 22);
      image(
        `${base}envelope-${recipe.layout === "polaroid" ? "brown" : "green"}.svg`,
        135,
        130,
        240,
        230,
      );
      if (recipe.layout === "envelope") {
        polaroid(garden, 237, 90, 115, 175, 10);
        polaroid(red, 140, 155, 125, 175, -12);
      } else {
        polaroid(garden, 157, 125, 170, 150, 5);
        image(botanical, 310, 210, 150, 260, { opacity: 0.4 });
      }
      text(`${names[0]}\n&\n${names[1]}`, 35, 410, 410, 180, 45, { italic: true });
      break;
    case "scallop":
      panel(0, 0, 70, 660, recipe.accent);
      panel(410, 0, 70, 660, recipe.accent);
      text(names[0], 80, 60, 140, 45, 23);
      text("囍", 215, 60, 50, 50, 38);
      text(names[1], 260, 60, 140, 45, 23);
      photo(red, 115, 140, 250, 420, 0, "scallop");
      image(`${base}wave.svg`, 0, 520, 480, 150);
      break;
    case "floral-names":
      image(`${base}olive-arch.svg`, 80, 45, 320, 510);
      image(botanical, -10, 5, 195, 290, { opacity: 0.45 });
      image(botanical, 290, 360, 190, 240, { flipX: true });
      text("THE\nWEDDING\nOF", 130, 105, 220, 95, 17);
      text(`${names[0]}\n\n&\n\n${names[1]}`, 100, 230, 280, 295, 43, { italic: true });
      break;
    case "glass":
      panel(122, 65, 236, 390, "#ffffff", 118, 0.78);
      text(`${names[0]}\n&\n${names[1]}`, 130, 180, 220, 140, 34);
      break;
    case "silk":
      image(`${base}silk.svg`, 0, 0, 480, 180);
      image(botanical, 0, 0, 220, 190);
      polaroid(garden, 110, 150, 138, 175, -8);
      polaroid(red, 250, 270, 135, 175, 12);
      text(`${names[0]}\n&\n${names[1]}`, 45, 500, 390, 135, 36, { italic: true });
      break;
    case "royal-arch":
      image(royal, 0, 20, 480, 600, { opacity: 0.3 });
      text(`${names[0]}       ${names[1]}`, 20, 45, 440, 60, 24);
      photo(red, 130, 130, 220, 410, 0, "scallop");
      text("❧     囍     ❧", 80, 590, 320, 55, 35);
      break;
    case "phoenix":
      text(`${names[0].toUpperCase()}\n${names[1].toUpperCase()}`, 30, 45, 275, 120, 34);
      panel(0, 310, 480, 120, recipe.accent);
      image(`${base}phoenix-pair.webp`, 10, 140, 460, 400, { opacity: 0.7 });
      text("囍", 175, 250, 130, 130, 100, { color: "#f7dfb7" });
      break;
    case "portraits":
      panel(0, 0, 480, 70, recipe.accent);
      image(`${base}dragon-pair.webp`, 0, 0, 480, 75, { opacity: 0.4 });
      panel(0, 150, 480, 40, recipe.accent);
      photo(`${base}photo-groom.webp`, 45, 90, 125, 125, 0, "oval");
      photo(`${base}photo-bride.webp`, 310, 90, 125, 125, 0, "oval");
      text("囍", 185, 115, 110, 75, 60, { color: "#f7dfb7" });
      text(names[0], 25, 230, 180, 70, 29);
      text(names[1], 280, 230, 180, 70, 29);
      break;
    case "royal-names":
      panel(0, 35, 480, 40, "#f7dba4");
      image(royal, 0, 0, 480, 690, { opacity: 0.1 });
      text(`${names[0]}\n&\n${names[1]}`, 30, 105, 420, 170, 45, { italic: true });
      image(royal, 100, 280, 280, 320);
      break;
  }

  const y = recipe.heroHeight;
  const card = dark ? "#fff4e3" : recipe.background;
  const ink = dark ? "#82343a" : recipe.ink;
  const cx = recipe.ceremony === "offset" ? 85 : 35;
  const cw = recipe.ceremony === "offset" ? 355 : 410;
  panel(
    cx - 10,
    y,
    cw + 20,
    625,
    card,
    recipe.ceremony === "glass" ? 30 : 8,
    recipe.ceremony === "glass" ? 0.86 : 1,
  );
  if (floral)
    image(botanical, recipe.ceremony === "offset" ? -25 : 340, y, 135, 210, { opacity: 0.55 });
  text("THÔNG TIN LỄ CƯỚI", cx, y + 25, cw, 45, 25, { color: ink });
  text("NHÀ TRAI\nÔng Nguyễn Văn An\nBà Trần Thu Lan", cx + 8, y + 90, cw / 2 - 18, 100, 17, {
    color: ink,
  });
  text(
    "NHÀ GÁI\nÔng Lê Thanh Minh\nBà Phạm Ngọc Hoa",
    cx + cw / 2 + 10,
    y + 90,
    cw / 2 - 18,
    100,
    17,
    { color: ink },
  );
  text("TRÂN TRỌNG BÁO TIN\nLỄ THÀNH HÔN CỦA CON CHÚNG TÔI", cx + 5, y + 220, cw - 10, 85, 20, {
    color: ink,
  });
  text(`${names[0]}\n&\n${names[1]}`, cx + 10, y + 310, cw - 20, 155, 36, {
    color: ink,
    italic: true,
  });
  text(
    "Lễ thành hôn được cử hành tại tư gia\n09:00 · " + recipe.date.split("-").reverse().join(" / "),
    cx + 15,
    y + 505,
    cw - 30,
    65,
    19,
    { color: ink },
  );
  if (recipe.layout === "silk") image(`${base}silk.svg`, 0, y + 595, 480, 110);

  const ay = y + 700;
  if (["floral-names", "glass", "royal-names", "phoenix"].includes(recipe.layout)) {
    photo(heroPhoto, 135, ay, 210, 270, 0, recipe.layout === "glass" ? "oval" : "arch");
  }
  const albumY =
    ay + (["floral-names", "glass", "royal-names", "phoenix"].includes(recipe.layout) ? 310 : 0);
  add(
    "StudioAlbum",
    {
      x: 25,
      y: albumY,
      width: 430,
      height: 335,
      title: "ALBUM ẢNH",
      images: Array.from({ length: recipe.albumCount }, (_, i) => (i % 2 ? red : garden)),
      color: ink,
      accent: recipe.accent,
      background: card,
      fontFamily: "EB Garamond",
    },
    "Album ảnh",
  );

  const ry = albumY + 410;
  const rx = recipe.reception === "offset" ? 25 : 55;
  const rw = recipe.reception === "offset" ? 350 : 370;
  if (floral) image(botanical, 330, ry + 30, 150, 200, { flipX: true, opacity: 0.5 });
  text("THÔNG TIN TIỆC CƯỚI", rx, ry, rw, 45, 25, { color: dark ? recipe.ink : ink });
  add(
    "StudioCalendar",
    {
      x: rx,
      y: ry + 70,
      width: rw,
      height: 310,
      title: "KHAI TIỆC · 18:00",
      eventDate: recipe.date,
      eventTime: "18:00",
      timezone: "Asia/Ho_Chi_Minh",
      fontFamily: "EB Garamond",
      color: ink,
      accent: recipe.accent,
      background: card,
    },
    "Lịch cưới",
  );
  add(
    "StudioAction",
    {
      x: rx + 45,
      y: ry + 405,
      width: rw - 90,
      height: 70,
      title: "THÊM VÀO LỊCH",
      action: "calendar",
      eventDate: recipe.date,
      eventTime: "18:00",
      timezone: "Asia/Ho_Chi_Minh",
      background: card,
      color: ink,
      accent: recipe.accent,
    },
    "Thêm vào lịch",
  );
  add(
    "StudioAction",
    {
      x: rx + 35,
      y: ry + 490,
      width: rw - 70,
      height: 75,
      title: "XÁC NHẬN THAM DỰ",
      action: "rsvp",
      background: card,
      color: ink,
      accent: recipe.accent,
    },
    "RSVP",
  );
  if (recipe.layout === "silk") image(`${base}silk.svg`, 0, ry + 570, 480, 120);
  const mapY = ry + 625;
  add(
    "StudioMap",
    {
      x: 45,
      y: mapY,
      width: 390,
      height: 285,
      title: "ĐỊA ĐIỂM TIỆC CƯỚI",
      address: "Trung tâm hội nghị · Thành phố Hồ Chí Minh",
      background: card,
      color: ink,
      accent: recipe.accent,
      fontFamily: "EB Garamond",
    },
    "Bản đồ",
  );
  text("DRESS CODE", 45, mapY + 330, 390, 40, 24);
  text(
    "Trang phục thanh lịch · Trắng, kem và " +
      (recipe.id.includes("xanh") ? "xanh olive" : "đỏ đô"),
    45,
    mapY + 380,
    390,
    45,
    17,
  );
  const ty = mapY + 470;
  text("LỊCH TRÌNH NGÀY CƯỚI", 35, ty, 410, 45, 24);
  text(
    "17:30  ·  Đón khách\n18:00  ·  Khai tiệc\n18:30  ·  Cắt bánh & nâng ly\n19:00  ·  Dùng tiệc\n21:00  ·  Lời chào cảm ơn",
    recipe.reception === "offset" ? 110 : 60,
    ty + 70,
    340,
    185,
    23,
    { textAlign: recipe.reception === "offset" ? "left" : "center", lineHeight: 1.55 },
  );
  add(
    "StudioWishes",
    {
      x: 40,
      y: ty + 325,
      width: 400,
      height: 285,
      title: "SỔ LƯU BÚT",
      background: card,
      color: ink,
      accent: recipe.accent,
      fontFamily: "EB Garamond",
    },
    "Lời chúc",
  );
  add(
    "StudioAction",
    {
      x: 90,
      y: ty + 650,
      width: 300,
      height: 85,
      title: "HỘP QUÀ MỪNG",
      action: "gift",
      message: "Sự hiện diện của bạn là món quà quý giá nhất.",
      background: card,
      color: ink,
      accent: recipe.accent,
    },
    "Quà mừng",
  );
  text(
    "Cảm ơn bạn đã cùng chúng mình\nviết nên ngày hạnh phúc.\n♡ InviteMe",
    40,
    ty + 785,
    400,
    120,
    22,
  );
  if (floral) image(botanical, 0, ty + 805, 130, 180, { opacity: 0.35 });
  nodes.ROOT = {
    type: { resolvedName: "StudioFrame" },
    isCanvas: true,
    props: {
      width: 480,
      height: ty + 990,
      background: recipe.background,
      ...(recipe.layout === "glass" ? { src: pink } : {}),
      revealPreset: "fade",
      revealDuration: 800,
      cover: {
        enabled: true,
        names: `${names[0]}\n&\n${names[1]}`,
        date: recipe.date.split("-").reverse().join(" / "),
        background: recipe.accent,
        style:
          dark || ["arch", "scallop", "phoenix", "portraits"].includes(recipe.layout)
            ? "traditional"
            : "botanical",
        particles: recipe.id.includes("xanh") ? "leaves" : "hearts",
        opening: "seal",
        decoration: recipe.layout === "glass" ? pink : botanical,
      },
    },
    displayName: "Khung / nền",
    custom: {},
    hidden: false,
    nodes: ids,
    linkedNodes: {},
  };
  const glass = glassPanel ? nodes[glassPanel] : undefined;
  if (glass) glass.props.height = ty + 960 - 570;
  return parseStudioDocument(JSON.stringify({ schemaVersion: 1, nodes }));
}

export const templateCatalog = [
  {
    id: "minimalism-burgundy",
    name: "Minimalism · Đỏ đậm",
    reference: "minimalism-do-dam",
    description: "Phong bì đỏ đô và giấy kem.",
    document: parseStudioDocument(JSON.stringify(burgundy)),
  },
  {
    id: "minimalism-brown",
    name: "Minimalism · Nâu",
    reference: "minimalism-nau",
    description: "Giấy kem và ảnh Polaroid.",
    document: parseStudioDocument(JSON.stringify(brown)),
  },
  ...recipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    reference: recipe.reference,
    description: recipe.description,
    document: compose(recipe),
  })),
];

export const storyTemplateCatalog: typeof templateCatalog = [];
export const studioTemplates = [...templateCatalog];
export function findTemplate(id: string | boolean | undefined) {
  return studioTemplates.find(
    (template) => template.id === (id === true ? "minimalism-brown" : id),
  );
}
