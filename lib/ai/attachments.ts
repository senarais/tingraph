export const ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const ATTACHMENT_ACCEPT = ATTACHMENT_MIME_TYPES.join(",");
export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_BYTES = 10 * 1024 * 1024;

export function attachmentProblem(mimeType: string, size: number): string | null {
  if (!ATTACHMENT_MIME_TYPES.includes(mimeType as (typeof ATTACHMENT_MIME_TYPES)[number])) {
    return "Choose a PDF, JPEG, PNG, WebP, HEIC, or HEIF file.";
  }
  if (!Number.isFinite(size) || size <= 0) {
    return "That file is empty or cannot be read.";
  }
  if (size > MAX_ATTACHMENT_BYTES) {
    return "Each file can be at most 5 MB.";
  }
  return null;
}

export function attachmentsProblem(count: number, totalBytes: number): string | null {
  if (count > MAX_ATTACHMENTS) {
    return "Attach up to 4 files at a time.";
  }
  if (totalBytes > MAX_ATTACHMENTS_BYTES) {
    return "Attachments can total at most 10 MB.";
  }
  return null;
}
