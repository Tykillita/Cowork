import type { ProjectAccessLink } from "../../types";

export const ACCESS_LINK_LIFETIME_DAYS = 7;

export function isLinkUsable(link: ProjectAccessLink, now = Date.now()) {
  return link.status === "active" && Date.parse(link.expiresAt) > now;
}
