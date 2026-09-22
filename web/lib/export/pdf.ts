/**
 * A one-page PDF holding one JPEG.
 *
 * A PDF page is a handful of objects and a table of their byte offsets, and a
 * JPEG is the one image format a viewer can read straight out of a stream
 * (`DCTDecode`), so a raster export needs no library — just the offsets kept
 * honestly. The page is measured in points at 72 per inch; the image inside it
 * can be any number of pixels, which is what carries the print resolution.
 */

const encoder = new TextEncoder();

interface Sheet {
  /** page size in points */
  pageWidth: number;
  pageHeight: number;
}

export function jpegToPdf(jpeg: Uint8Array, sheet: Sheet): Blob {
  const width = round(sheet.pageWidth);
  const height = round(sheet.pageHeight);
  const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (body: string, stream?: Uint8Array) => {
    offsets.push(length);
    push(`${offsets.length} 0 obj\n${body}\n`);
    if (stream) {
      push("stream\n");
      push(stream);
      push("\nendstream\n");
    }
    push("endobj\n");
  };

  // a binary comment on line two marks the file as binary for transfer tools
  push("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  object("<< /Type /Catalog /Pages 2 0 R >>");
  object("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    "<< /Type /Page /Parent 2 0 R " +
      `/MediaBox [0 0 ${width} ${height}] ` +
      "/Resources << /XObject << /Im0 4 0 R >> >> " +
      "/Contents 5 0 R >>",
  );
  const pixels = frame(jpeg);
  object(
    "<< /Type /XObject /Subtype /Image " +
      `/Width ${pixels.width} /Height ${pixels.height} ` +
      "/ColorSpace /DeviceRGB /BitsPerComponent 8 " +
      `/Filter /DCTDecode /Length ${jpeg.length} >>`,
    jpeg,
  );
  object(`<< /Length ${content.length} >>`, encoder.encode(content));

  const xref = length;
  push(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) {
    push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  push(
    `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\n` +
      `startxref\n${xref}\n%%EOF\n`,
  );

  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Pixel size read off the JPEG's own frame header. The stream is copied into
 * the file verbatim, so the dictionary has to agree with what is inside it.
 */
function frame(jpeg: Uint8Array): { width: number; height: number } {
  let at = 2;
  while (at + 9 < jpeg.length) {
    if (jpeg[at] !== 0xff) {
      at += 1;
      continue;
    }
    const marker = jpeg[at + 1];
    // SOF0..SOF15, skipping the four that are not frame headers
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: (jpeg[at + 5] << 8) | jpeg[at + 6],
        width: (jpeg[at + 7] << 8) | jpeg[at + 8],
      };
    }
    at += 2 + ((jpeg[at + 2] << 8) | jpeg[at + 3]);
  }
  return { width: 0, height: 0 };
}
