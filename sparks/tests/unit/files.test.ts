import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { cleanFileName, decodePngDataUrl, sniffImageType } from "@/lib/files";
import { assertSafeKey } from "@/server/storage";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe("sniffImageType", () => {
  it("recognises photo formats by their first bytes", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(bytes("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(bytes("\0\0\0\x18ftypheic\0\0"))).toBe("image/heic");
  });

  it("rejects anything else, whatever it's called", () => {
    expect(sniffImageType(bytes("<svg xmlns="))).toBeNull();
    expect(sniffImageType(bytes("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(bytes("<html><script>"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe("decodePngDataUrl", () => {
  it("accepts a real PNG data URL", () => {
    const url = `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`;
    expect(decodePngDataUrl(url)).toEqual(PNG);
  });

  it("rejects other types and non-PNG bytes", () => {
    expect(decodePngDataUrl(`data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`)).toBeNull();
    expect(decodePngDataUrl(`data:image/png;base64,${Buffer.from("<svg/>").toString("base64")}`)).toBeNull();
    expect(decodePngDataUrl("")).toBeNull();
  });
});

describe("cleanFileName", () => {
  it("strips path and header-breaking characters", () => {
    const cleaned = cleanFileName('../../etc/"passwd"\r\n.jpg', "x");
    expect(cleaned).not.toMatch(/[/\\"\r\n]/);
    expect(cleaned.endsWith(".jpg")).toBe(true);
    expect(cleanFileName("Panel 3 (before).jpg", "x")).toBe("Panel 3 _before_.jpg");
    expect(cleanFileName("...", "photo.jpg")).toBe("photo.jpg");
  });
});

describe("assertSafeKey", () => {
  it("allows the keys we generate", () => {
    expect(() => assertSafeKey("work-orders/cmh1abc/3f2a9c1e-1b2c-4d5e-8f90-123456789abc.jpg")).not.toThrow();
  });

  it("refuses anything that could leave the storage folder", () => {
    for (const key of ["../secret.txt", "work-orders/../../x.jpg", "/etc/passwd.x", "work-orders\\x.jpg", "work-orders/x"]) {
      expect(() => assertSafeKey(key)).toThrow();
    }
  });
});
