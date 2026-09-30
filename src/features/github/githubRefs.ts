/**
 * Checks a branch name against `git check-ref-format --branch`, so GitHub does
 * not reject it after the person has filled the form. Returns an error message
 * in Spanish, or "" when the name is valid.
 */
export function branchNameProblem(value: string) {
  const name = value.trim();
  if (!name) return "Escribe el nombre de la rama.";
  if (name.length > 120) return "Usa un nombre de rama de 120 caracteres como máximo.";
  if (/\s/.test(name)) return "El nombre de la rama no puede tener espacios. Usa guiones: feature/nuevo-cambio.";
  if (/[~^:?*[\\\x00-\x1f\x7f]/.test(name)) return "El nombre de la rama no puede tener ~ ^ : ? * [ ni \\.";
  if (name.includes("..")) return "El nombre de la rama no puede tener dos puntos seguidos (..).";
  if (name.includes("@{") || name === "@") return "El nombre de la rama no puede ser @ ni contener @{.";
  if (name.startsWith("/") || name.endsWith("/") || name.includes("//")) return "Las barras (/) deben separar partes con nombre, sin repetirse ni quedar al inicio o al final.";
  if (name.startsWith("-")) return "El nombre de la rama no puede empezar con un guion.";
  if (name.endsWith(".")) return "El nombre de la rama no puede terminar en punto.";
  if (name.split("/").some((part) => part.startsWith(".") || part.endsWith(".lock"))) return "Ninguna parte del nombre puede empezar con punto ni terminar en .lock.";
  return "";
}

/** Path for the git refs API: every segment encoded, slashes kept. */
export function encodeBranchPath(name: string) {
  return name.split("/").map(encodeURIComponent).join("/");
}
