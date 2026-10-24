// File checks shared by uploads. Pure (no Node/Next imports) so they can be unit-tested.
// We never trust the browser's content type: the type comes from the file's first bytes.

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_PHOTOS_PER_UPLOAD = 10;
export const MAX_SIGNATURE_BYTES = 1024 * 1024;

export type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

const EXTENSIONS: Record<ImageType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

export function extensionFor(type: ImageType): string {
  return EXTENSIONS[type];
}

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

/** The image type from the file's signature, or null if it isn't a photo format we accept. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  // iPhone photos: ISO-BMFF "ftyp" box with a HEIF brand.
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp" && ["heic", "heix", "heif", "mif1", "msf1", "hevc"].includes(ascii(bytes, 8, 12))) return "image/heic";
  return null;
}

/** Decode a `data:image/png;base64,…` URL from the signature pad. Returns null if it isn't one. */
export function decodePngDataUrl(dataUrl: string): Uint8Array | null {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return null;
  const binary = atob(match[1]);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return sniffImageType(bytes) === "image/png" ? bytes : null;
}

/** A file name safe to show and to put in a Content-Disposition header. */
export function cleanFileName(name: string, fallback: string): string {
  const cleaned = name.replace(/[^\w.\- ]+/g, "_").replace(/^[.\s]+/, "").slice(0, 120).trim();
  return cleaned || fallback;
}
