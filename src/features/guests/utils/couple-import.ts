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
  [
    "Nguyễn Văn An",
    "Bác",
    "4",
    "Nhà gái",
    "Họ ngoại",
    "",
    "Gia đình có hai trẻ nhỏ cần ghế",
    "",
  ],
  ["Trần Thị Hoa", "Cô", "2", "Nhà gái", "Họ ngoại", "", "Muốn ngồi gần lối ra", ""],
  ["Lê Minh Anh", "Bạn", "2", "Nhà gái", "Bạn đại học", "", "Đi cùng một người", ""],
  ["Phạm Thu Hà", "Bạn", "1", "Nhà gái", "Bạn đại học", "", "", ""],
  ["Hoàng Quốc Nam", "Anh", "1", "Nhà trai", "Đồng nghiệp", "", "", ""],
];

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
  const header = records.shift()?.cells.map((value) => value.trim());
  if (!header)
    throw new Error(
      "File cần đúng 8 cột theo thứ tự trong mẫu. Hãy tải mẫu và giữ nguyên dòng tiêu đề.",
    );

  // If the file includes the legacy "Kiểu lời mời" column, strip it from header and records
  const kindIndex = header.indexOf("Kiểu lời mời");
  if (kindIndex !== -1) {
    header.splice(kindIndex, 1);
    for (const record of records) {
      if (record.cells.length > kindIndex) {
        record.cells.splice(kindIndex, 1);
      }
    }
  }

  const sevenHeaders = coupleHeaders.slice(0, 7);
  const sixLegacyHeaders = [
    coupleHeaders[0], // Tên người nhận
    coupleHeaders[1], // Danh xưng
    coupleHeaders[2], // Tổng người dự kiến
    coupleHeaders[4], // Nhóm khách
    coupleHeaders[5], // SĐT
    coupleHeaders[6], // Ghi chú
  ];

  const isStandard = header.length === 8 && coupleHeaders.every((name, i) => name === header[i]);
  const isSeven = header.length === 7 && sevenHeaders.every((name, i) => name === header[i]);
  const isSixLegacy =
    header.length === 6 && sixLegacyHeaders.every((name, i) => name === header[i]);

  if (!isStandard && !isSeven && !isSixLegacy) {
    throw new Error(
      "File cần đúng 8 cột theo thứ tự trong mẫu. Hãy tải mẫu và giữ nguyên dòng tiêu đề.",
    );
  }
  if (!records.length) throw new Error("File chưa có khách. Thêm ít nhất một người nhận thiệp.");
  if (records.length > 500)
    throw new Error("Mỗi file tối đa 500 dòng khách. Hãy chia thành nhiều file.");
  return validateCoupleRows(
    records.map(({ line, cells }) => {
      const values = cells.map((value) => value.trim());
      if (isSixLegacy) values.splice(3, 0, "");
      if (isSixLegacy || isSeven) values.push("");
      return { line, values };
    }),
  );
}

export function validateCoupleRows(rows: { line: number; values: string[] }[]): CoupleRow[] {
  const seenNames = new Set<string>(),
    seenPhones = new Set<string>();
  return rows.map(({ line, values: rawValues }) => {
    const values = rawValues.map((value) => value.trim());
    // Existing templates have no Email column; missing optional trailing cells stay blank.
    if (values.length === 7) values.push("");
    const errors: string[] = [],
      warnings: string[] = [];
    if (values.length !== 8) errors.push("Dòng cần đủ 8 ô, kể cả ô để trống.");
    const [name = "", , rawCount = "", rawSide = "", , phone = "", , email = ""] = values;
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
    const expected = rawCount === "" ? 1 : /^\d+$/.test(rawCount) ? Number(rawCount) : null;
    if (expected === null || !Number.isSafeInteger(expected) || expected < 1)
      errors.push("Tổng người dự kiến phải là số nguyên từ 1 trở lên.");
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
