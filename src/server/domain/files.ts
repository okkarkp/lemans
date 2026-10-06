/** The type is decided from the file's first bytes, never from its name or the browser's claim. */
export function sniffType(b: Uint8Array): "application/pdf" | "image/jpeg" | "image/png" | null {
  const starts = (sig: number[]) => sig.every((v, i) => b[i] === v);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}

/** Keeps a readable, harmless file name: no path parts, control or shell characters. */
export const safeFileName = (name: string) =>
  (name.normalize("NFKC").replace(/[^\w.\- ]+/g, "_").replace(/^[.\s]+/, "").slice(0, 120) || "document");

