import { parseCoupleSheet, parseCoupleCsv } from "./couple-import";

export async function readCoupleFile(file: File) {
  if (/\.csv$/i.test(file.name)) return parseCoupleCsv(await file.text());
  const { readSheet } = await import("read-excel-file/universal");
  const data = await readSheet(await file.arrayBuffer());
  const width = data[0]?.length ?? 8;
  return parseCoupleSheet(
    data.map((row) =>
      Array.from({ length: Math.max(width, row.length) }, (_, i) => {
        const value = row[i];
        return value instanceof Date ? value.toISOString() : String(value ?? "");
      }),
    ),
  );
}
