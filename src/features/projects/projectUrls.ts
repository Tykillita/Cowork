export function normalizePreviewUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" && parsed.hostname ? parsed.toString() : "";
  } catch {
    return "";
  }
}
