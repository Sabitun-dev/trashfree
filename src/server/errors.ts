// API errors carry a short code; the app turns the code into a friendly sentence in the user's language.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public data?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export const bad = (code: string, data?: Record<string, unknown>) => new ApiError(400, code, data);
export const forbidden = (code = "forbidden") => new ApiError(403, code);
export const notFound = (code = "not_found") => new ApiError(404, code);
export const conflict = (code: string, data?: Record<string, unknown>) => new ApiError(409, code, data);
export const tooMany = (code = "too_many") => new ApiError(429, code);

/** Never print full phone numbers in logs. */
export function maskPhone(p: string | null | undefined): string {
  if (!p) return "";
  return p.length > 6 ? p.slice(0, 4) + "***" + p.slice(-2) : "***";
}

/** Log without leaking secrets: strips anything that looks like a token or URL credential. */
export function safeLog(msg: string, err?: unknown) {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : err ? String(err) : "";
  const clean = `${msg} ${text}`
    .replace(/\d{6,}:[A-Za-z0-9_-]{30,}/g, "<bot-token>")
    .replace(/postgres(ql)?:\/\/[^\s]+/g, "<db-url>")
    .replace(/\+?998\d{9}/g, (m) => maskPhone(m));
  console.error(clean);
}
