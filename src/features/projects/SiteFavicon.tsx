import { useEffect, useState } from "react";

/**
 * Icon of the project's preview site. The site's HTML cannot be read from here
 * (cross-origin), so the usual icon paths are tried as images, straight from
 * that site and never through third-party favicon services. The first one that
 * loads is remembered per site; if none does, the project's initial is shown.
 */

const NAMES = ["favicon.svg", "favicon.ico", "favicon.png", "apple-touch-icon.png", "icon.svg"];
// These sites publish their icons at custom paths and don't allow cross-origin
// HTML reads, so the client can't discover the href from their <link> tags.
const SITE_ICONS: Record<string, string[]> = {
  "istargetsleeping.web.app": ["/media/istargetsleeping-icon.svg"],
  "vetcentercaninosyfelinos.web.app": ["/assets/images/app-icon-192.png", "/assets/images/apple-touch-icon.png"],
};
// New key forces sites that were cached as "no icon" to retry the expanded list.
const CACHE_KEY = "cowork.site-favicons:v2";
const MISSING = "";
const memory = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function readCache(): Record<string, string> {
  try { return JSON.parse(window.localStorage.getItem(CACHE_KEY) || "{}") ?? {}; } catch { return {}; }
}

function writeCache(site: string, icon: string) {
  try {
    const cache = readCache();
    cache[site] = icon;
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* The icon is simply probed again next time. */ }
}

/** Candidate URLs: next to the page first (GitHub Pages project sites), then at the site root. */
export function faviconCandidates(previewUrl: string) {
  let page: URL;
  try { page = new URL(previewUrl); } catch { return []; }
  if (page.protocol !== "https:") return [];
  const base = new URL(page.href);
  base.search = "";
  base.hash = "";
  const last = base.pathname.split("/").pop() ?? "";
  if (!base.pathname.endsWith("/") && !last.includes(".")) base.pathname += "/";
  const known = SITE_ICONS[page.hostname.toLowerCase()] ?? [];
  const urls = [
    ...known.map((path) => new URL(path, page.origin).href),
    ...NAMES.map((name) => new URL(name, base).href),
    ...NAMES.map((name) => new URL(`/${name}`, base.origin).href),
  ];
  return [...new Set(urls)];
}

function loads(url: string) {
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    image.referrerPolicy = "no-referrer";
    const timer = window.setTimeout(() => { image.src = ""; resolve(false); }, 6000);
    image.onload = () => { window.clearTimeout(timer); resolve(image.naturalWidth > 0); };
    image.onerror = () => { window.clearTimeout(timer); resolve(false); };
    image.src = url;
  });
}

function findFavicon(site: string) {
  const known = memory.get(site) ?? readCache()[site];
  if (known !== undefined) {
    memory.set(site, known);
    return Promise.resolve(known);
  }
  const running = pending.get(site);
  if (running) return running;
  const task = (async () => {
    for (const candidate of faviconCandidates(site)) {
      if (await loads(candidate)) return candidate;
    }
    return MISSING;
  })().then((icon) => {
    memory.set(site, icon);
    writeCache(site, icon);
    pending.delete(site);
    return icon;
  });
  pending.set(site, task);
  return task;
}

export function SiteFavicon({ previewUrl, iconUrl = "", name, className = "projectBrowserFavicon" }: { previewUrl: string; iconUrl?: string; name: string; className?: string }) {
  const [icon, setIcon] = useState(() => iconUrl || (previewUrl && memory.get(previewUrl)) || "");
  const [manualFailed, setManualFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setManualFailed(false);
    // An icon chosen by the owner wins; detection is only the fallback.
    if (iconUrl) { setIcon(iconUrl); return; }
    setIcon(memory.get(previewUrl) ?? "");
    if (!previewUrl) return;
    void findFavicon(previewUrl).then((found) => { if (active) setIcon(found); });
    return () => { active = false; };
  }, [iconUrl, previewUrl]);

  useEffect(() => {
    if (!manualFailed || !previewUrl) return;
    let active = true;
    void findFavicon(previewUrl).then((found) => { if (active) setIcon(found); });
    return () => { active = false; };
  }, [manualFailed, previewUrl]);

  return (
    <span className={`${className}${icon ? " hasIcon" : ""}`} aria-hidden="true">
      {icon
        ? <img src={icon} alt="" referrerPolicy="no-referrer" onError={() => { setIcon(""); if (icon === iconUrl) setManualFailed(true); }} />
        : name.slice(0, 1).toUpperCase()}
    </span>
  );
}
