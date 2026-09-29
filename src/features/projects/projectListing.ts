import { comparable } from "../../lib/text";
import type { PersonalPreferences, Project } from "../../types";

/**
 * Search, favourites filter and personal order, applied before pagination.
 * Favourites always come first; within each group the chosen order applies.
 */
export function arrangeProjects(projects: Project[], preferences: Pick<PersonalPreferences, "favorites" | "order" | "sort" | "filter">, query: string) {
  const favorites = new Set(preferences.favorites);
  const needle = comparable(query);
  const matches = projects.filter((project) => {
    if (preferences.filter === "favorites" && !favorites.has(project.id)) return false;
    if (!needle) return true;
    return comparable(project.name).includes(needle) || comparable(project.description).includes(needle);
  });
  const recency = new Map(projects.map((project, index) => [project.id, index]));
  const custom = new Map(preferences.order.map((id, index) => [id, index]));
  const compare = (a: Project, b: Project) => {
    if (preferences.sort === "name") return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
    if (preferences.sort === "custom") {
      const left = custom.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const right = custom.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (left !== right) return left - right;
    }
    return b.createdAt.localeCompare(a.createdAt) || (recency.get(a.id) ?? 0) - (recency.get(b.id) ?? 0);
  };
  return matches.sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)) || compare(a, b));
}

/** Full personal order: saved ids first (only existing projects), then the rest by recency. */
export function personalOrder(projects: Project[], order: string[]) {
  const known = new Set(projects.map((project) => project.id));
  const saved = order.filter((id) => known.has(id));
  const rest = projects.filter((project) => !saved.includes(project.id)).map((project) => project.id);
  return [...saved, ...rest];
}

export function moveInOrder(order: string[], id: string, offset: -1 | 1) {
  const index = order.indexOf(id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
