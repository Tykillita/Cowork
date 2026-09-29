/** Case- and accent-insensitive comparison key, e.g. "Diseño  UX" → "diseno ux". */
export function comparable(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}
