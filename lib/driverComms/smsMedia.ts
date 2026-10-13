import {
  SMS_MEDIA_MAX_BYTES,
  SMS_MEDIA_MAX_FILES,
} from "@/lib/driverComms/smsMediaLimits";

export { SMS_MEDIA_MAX_BYTES, SMS_MEDIA_MAX_FILES };

const ALLOWED_EXT = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "svg",
  "heic",
  "ai",
  "mp4",
  "mpeg",
  "3gp",
  "mp3",
  "wav",
  "wave",
  "aiff",
  "aif",
  "aifc",
  "gsm",
  "ulaw",
  "ogg",
  "aac",
  "m4a",
  "amr",
  "pdf",
  "doc",
  "docx",
  "txt",
  "csv",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "zip",
  "rar",
  "vcf",
  "vcard",
  "ics",
]);

export type SmsMediaFile = {
  buffer: Buffer;
  filename: string;
  contentType: string;
};

export function assertSmsMediaAllowed(file: {
  filename: string;
  size: number;
  contentType?: string;
}): void {
  const name = String(file.filename || "file").trim() || "file";
  const ext = name.includes(".")
    ? name.split(".").pop()!.toLowerCase()
    : "";
  if (ext && !ALLOWED_EXT.has(ext)) {
    const err = new Error(
      `Unsupported file type .${ext}. Use images, video, audio, PDF, or common office files.`
    );
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (file.size > SMS_MEDIA_MAX_BYTES) {
    const err = new Error(
      `${name} is too large (max ${Math.round(SMS_MEDIA_MAX_BYTES / (1024 * 1024))} MB).`
    );
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
}

export async function filesFromFormData(
  form: FormData,
  field = "files"
): Promise<SmsMediaFile[]> {
  const raw = form.getAll(field);
  const out: SmsMediaFile[] = [];
  for (const item of raw) {
    if (!(item instanceof File)) continue;
    if (!item.size) continue;
    assertSmsMediaAllowed({
      filename: item.name,
      size: item.size,
      contentType: item.type,
    });
    const buf = Buffer.from(await item.arrayBuffer());
    out.push({
      buffer: buf,
      filename: item.name || `file-${out.length + 1}`,
      contentType: item.type || "application/octet-stream",
    });
  }
  if (out.length > SMS_MEDIA_MAX_FILES) {
    const err = new Error(`Max ${SMS_MEDIA_MAX_FILES} attachments per message.`);
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  return out;
}

export async function parseSmsComposeRequest(req: Request): Promise<{
  text: string;
  files: SmsMediaFile[];
}> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const text = String(form.get("text") || "").trim();
    const files = await filesFromFormData(form);
    return { text, files };
  }
  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    attachments?: string[];
  };
  return {
    text: String(body.text || "").trim(),
    files: [],
  };
}

export function composeLoggedSmsBody(
  text: string,
  attachmentUrls: string[]
): string {
  const parts = [String(text || "").trim(), ...attachmentUrls.filter(Boolean)];
  return parts.filter(Boolean).join("\n");
}
