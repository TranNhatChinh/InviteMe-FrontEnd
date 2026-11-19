import { readFile } from "node:fs/promises";
import path from "node:path";

const assets: Record<string, { directory: string; pattern: RegExp }> = {
  legacy: { directory: "legacy/build", pattern: /^pdf\.worker\.min\.mjs$/ },
  cmaps: { directory: "cmaps", pattern: /^[\w-]+\.bcmap$/ },
  standard_fonts: { directory: "standard_fonts", pattern: /^[\w-]+\.(pfb|ttf)$/ },
  wasm: { directory: "wasm", pattern: /^[\w.-]+\.(wasm|mjs|js)$/ },
  iccs: { directory: "iccs", pattern: /^[\w-]+\.icc$/ },
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ group: string; file: string }> },
) {
  const { group, file } = await params;
  const asset = Object.hasOwn(assets, group) ? assets[group] : undefined;
  if (process.env.NODE_ENV !== "development" || !asset?.pattern.test(file)) {
    return new Response(null, { status: 404 });
  }

  try {
    const data = await readFile(
      path.join(process.cwd(), "node_modules", "pdfjs-dist", asset.directory, file),
    );
    const contentType = file.endsWith(".wasm")
      ? "application/wasm"
      : /\.m?js$/.test(file)
        ? "text/javascript"
        : "application/octet-stream";
    return new Response(new Uint8Array(data), { headers: { "Content-Type": contentType } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return new Response(null, { status: 404 });
  }
}
