import { defaultGroups, findGroup } from "./group-catalog";

export const coupleHeaders = [
  "Tên người nhận",
  "Danh xưng",
  "Tổng người dự kiến",
  "Phía khách mời",
  "Nhóm khách",
  "SĐT",
  "Ghi chú",
  "Email",
] as const;

export const coupleExamples = [
  ["Nguyễn Văn An", "Bác", "4", "Nhà gái", "Họ hàng", "", "Gia đình có hai trẻ nhỏ cần ghế"],
  ["Trần Thị Hoa", "Cô", "2", "Nhà gái", "Họ hàng", "", "Muốn ngồi gần lối ra"],
  ["Lê Minh Anh", "Bạn", "2", "Nhà gái", "Bạn bè", "", "Đi cùng một người"],
  ["Phạm Thu Hà", "Bạn", "1", "Nhà gái", "Bạn bè", "", ""],
  ["Hoàng Quốc Nam", "Anh", "1", "Nhà trai", "Đồng nghiệp", "", ""],
].map((row) => [...row, ""]);

export type CoupleRow = {
  line: number;
  values: string[];
  expected: number | null;
  defaulted: boolean;
  errors: string[];
  warnings: string[];
};

// Strict CSV reader: quoted commas, escaped quotes and multiline cells are preserved.
export function parseCoupleCsv(source: string): CoupleRow[] {
  const text = source.replace(/^\uFEFF/, "");
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [],
    cell = "",
    quoted = false,
    closed = false,
    line = 1,
    start = 1;
  function field() {
    cells.push(cell);
    cell = "";
    closed = false;
  }
  function record() {
    field();
    if (cells.some((value) => value.trim())) records.push({ line: start, cells });
    cells = [];
  }
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        cell += char;
        if (char === "\n") line++;
      }
    } else if (char === ",") field();
    else if (char === "\r" || char === "\n") {
      record();
      if (char === "\r" && text[i + 1] === "\n") i++;
      line++;
      start = line;
    } else if (char === '"' && cell === "" && !closed) quoted = true;
    else {
      if (closed || char === '"')
        throw new Error(`Dòng ${line}: dấu ngoặc kép không đúng. Hãy lưu lại dưới dạng CSV UTF-8.`);
      cell += char;
    }
  }
  if (quoted) throw new Error("Có ô chưa đóng dấu ngoặc kép. Hãy kiểm tra và lưu lại file CSV.");
  if (cell || cells.length || closed) record();
  return parseCoupleRecords(records);
}

// XLSX row indexes must not be shifted by multiline cells converted through CSV.
export function parseCoupleSheet(data: string[][]): CoupleRow[] {
  return parseCoupleRecords(
    data
      .map((cells, index) => ({ line: index + 1, cells }))
      .filter(({ cells }) => cells.some((value) => value.trim())),
  );
}

function parseCoupleRecords(records: { line: number; cells: string[] }[]): CoupleRow[] {
  const header = records.shift()?.cells.map((value) => value.trim());
  // Match both the current template and the previously published variants.
  const columns = [
    [...coupleHeaders],
    [...coupleHeaders.slice(0, 2), "Kiểu lời mời", ...coupleHeaders.slice(2)],
  ]
    .flatMap((names) => [
      names,
      names.filter((name) => name !== "Email"),
      names.filter((name) => name !== "Email" && name !== "Phía khách mời"),
    ])
    .find(
      (names) => header?.length === names.length && names.every((name, i) => name === header[i]),
    );
  if (!columns)
    throw new Error("File cần đúng 8 cột theo thứ tự trong mẫu. Hãy giữ nguyên dòng tiêu đề.");
  if (!records.length) throw new Error("File chưa có khách. Thêm ít nhất một người nhận thiệp.");
  if (records.length > 500)
    throw new Error("Mỗi file tối đa 500 dòng khách. Hãy chia thành nhiều file.");
  return validateCoupleRows(
    records.map(({ line, cells }) => {
      const legacyKind = columns.indexOf("Kiểu lời mời");
      const values = cells.map((value) => value.trim());
      if (legacyKind >= 0) values.splice(legacyKind, 1);
      if (!columns.includes("Phía khách mời")) values.splice(3, 0, "");
      return { line, values };
    }),
  );
}

export function validateCoupleRows(rows: { line: number; values: string[] }[]): CoupleRow[] {
  const seenNames = new Set<string>(),
    seenPhones = new Set<string>();
  return rows.map(({ line, values: rawValues }) => {
    const values = rawValues.map((value, index) => {
      const text = value.normalize("NFC").trim();
      return [0, 1, 6].includes(index) ? text.replace(/\s+/g, " ") : text;
    });
    // Existing templates have no Email column; missing optional trailing cells stay blank.
    if (values.length === 7) values.push("");
    const errors: string[] = [],
      warnings: string[] = [];
    if (values.length !== 8) errors.push("Dòng cần đủ 8 ô, kể cả ô để trống.");
    const [name = "", , rawCount = "", rawSide = "", , phone = ""] = values;
    const email = values[7] ?? "";
    if (
      phone &&
      (phone.length > 30 ||
        !/^\+?[0-9][0-9 ().-]*$/.test(phone) ||
        phone.replace(/[^0-9]/g, "").length < 7 ||
        phone.replace(/[^0-9]/g, "").length > 15)
    )
      errors.push(
        "SĐT cần 7–15 chữ số; chỉ dùng dấu + ở đầu, khoảng trắng, dấu chấm, gạch nối hoặc ngoặc.",
      );
    // Match FluentValidation EmailAddress(): one @ with content on both sides.
    const at = email.indexOf("@");
    if (
      email &&
      (email.length > 254 || at <= 0 || at === email.length - 1 || at !== email.lastIndexOf("@"))
    )
      errors.push("Email không đúng định dạng hoặc vượt quá 254 ký tự.");
    if (!name) errors.push("Thiếu tên người nhận.");
    if (name.length > 150) errors.push("Tên người nhận không được vượt quá 150 ký tự.");
    if ((values[1] ?? "").length > 50) errors.push("Danh xưng không được vượt quá 50 ký tự.");
    if ((values[6] ?? "").length > 2000) errors.push("Ghi chú không được vượt quá 2.000 ký tự.");
    const expected = rawCount === "" ? 1 : /^\d+$/.test(rawCount) ? Number(rawCount) : null;
    if (expected === null || !Number.isSafeInteger(expected) || expected < 1 || expected > 10)
      errors.push(
        rawCount
          ? `Số suất phải từ 1 đến 10 (đang là ${rawCount})`
          : "Tổng người dự kiến phải là số nguyên từ 1 đến 10.",
      );
    const rawGroup = values[4] ?? "";
    const group = findGroup(rawGroup, defaultGroups);
    if (rawGroup && !group)
      errors.push(`Nhóm "${rawGroup}" chưa có trong danh sách nhóm của đám cưới`);
    values[4] = group ?? rawGroup;
    if (!rawGroup) warnings.push("Chưa chọn nhóm: đang dùng Khác.");
    if (!rawCount) warnings.push("Chưa nhập số suất: đang dùng 1 suất.");
    const side = ["Nhà gái", "Nhà trai", "Chung"].find(
      (label) => label.toLocaleLowerCase("vi") === rawSide.toLocaleLowerCase("vi"),
    );
    if (rawSide && !side) errors.push("Phía khách mời chọn Nhà gái, Nhà trai hoặc Chung.");
    if (!rawSide) warnings.push("Chưa xác định phía khách mời; không mặc định là Chung.");
    values[3] = side ?? rawSide;
    if (values.some((value, index) => /^[=+@-]/.test(value) && index !== 5))
      errors.push("Dùng văn bản hoặc số, không dùng công thức trong các ô.");
    const nameKey = name.normalize("NFC").toLocaleLowerCase("vi").replace(/\s+/g, " ");
    const phoneKey = phone.replace(/[\s().-]/g, "");
    if ((nameKey && seenNames.has(nameKey)) || (phoneKey && seenPhones.has(phoneKey)))
      warnings.push("Tên hoặc SĐT trùng dòng trước. Kiểm tra lại; các dòng vẫn được giữ riêng.");
    if (nameKey) seenNames.add(nameKey);
    if (phoneKey) seenPhones.add(phoneKey);
    return {
      line,
      values,
      expected: errors.length ? null : expected,
      defaulted: rawCount === "",
      errors,
      warnings,
    };
  });
}

export function coupleCsv(rows: readonly (readonly (string | number | null)[])[]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row.map((value) => '"' + String(value ?? "").replaceAll('"', '""') + '"').join(","),
      )
      .join("\r\n") +
    "\r\n"
  );
}
