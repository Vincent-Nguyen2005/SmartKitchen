// Copied from inventory-service/src/lib/multipart.ts (catalog image uploads; services share no code).
export type MultipartFile = { fieldName: string; fileName: string; mimeType: string; data: Buffer };

const CRLF = Buffer.from("\r\n");
const HEADER_END = Buffer.from("\r\n\r\n");

const boundaryFrom = (contentType: string | undefined): string | null => {
  if (!contentType || !/^multipart\/form-data\b/i.test(contentType)) return null;
  const match = contentType.match(/boundary=(?:"([^"]{1,70})"|([^\s;]{1,70}))/i);
  return match ? (match[1] ?? match[2]) : null;
};

const headerParam = (header: string, name: string): string | undefined =>
  header.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1];

/**
 * Parses a buffered multipart/form-data body and returns its file parts.
 * Only used for small single-image uploads whose total size is already capped by the raw body parser.
 */
export const parseMultipartFiles = (body: Buffer, contentType: string | undefined): MultipartFile[] | null => {
  const boundary = boundaryFrom(contentType);
  if (!boundary || !Buffer.isBuffer(body)) return null;
  const delimiter = Buffer.from(`--${boundary}`);
  const files: MultipartFile[] = [];
  let cursor = body.indexOf(delimiter);
  if (cursor < 0) return null;

  while (cursor >= 0) {
    const afterDelimiter = cursor + delimiter.length;
    // `--boundary--` closes the body.
    if (body[afterDelimiter] === 0x2d && body[afterDelimiter + 1] === 0x2d) break;
    if (!body.subarray(afterDelimiter, afterDelimiter + 2).equals(CRLF)) return null;
    const headersStart = afterDelimiter + 2;
    const headersEnd = body.indexOf(HEADER_END, headersStart);
    if (headersEnd < 0) return null;
    const next = body.indexOf(Buffer.concat([CRLF, delimiter]), headersEnd + HEADER_END.length);
    if (next < 0) return null;

    const headers = body.subarray(headersStart, headersEnd).toString("latin1");
    const disposition = headers.split("\r\n").find((line) => /^content-disposition:/i.test(line)) ?? "";
    const typeLine = headers.split("\r\n").find((line) => /^content-type:/i.test(line));
    const fileName = headerParam(disposition, "filename");
    if (fileName !== undefined) {
      files.push({
        fieldName: headerParam(disposition, "name") ?? "",
        fileName,
        mimeType: (typeLine?.split(":")[1] ?? "application/octet-stream").trim().toLowerCase(),
        data: body.subarray(headersEnd + HEADER_END.length, next),
      });
    }
    cursor = next + CRLF.length;
  }
  return files;
};
