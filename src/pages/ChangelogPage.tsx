import { useEffect, useLayoutEffect, useState } from "react";
import { CoworkMark } from "../components/CoworkMark";
import { GitHubMark } from "../features/code/repoIcons";
import { LATEST, NEXT, RELEASES, releaseAnchor, type Lang, type Release, type ReleaseItem, type ReleaseKind, type Text } from "../features/changelog/releases";
import "../styles/changelog.css";

/**
 * Public changelog at /novedades, outside the sign-in flow: the same structure
 * as isTargetSleeping's novedades.html (navigation, hero with the version index,
 * a timeline grouped in Nuevo / Cambios / Arreglos, footer) in Cowork's style,
 * in Spanish or English with system, light or dark mode.
 */

const REPO = "https://github.com/Tykillita/Cowork";
/** The README section with the feature table, in the reader's language. */
const featuresUrl = (lang: Lang) => (lang === "es" ? `${REPO}#funciones` : `${REPO}/blob/main/README.en.md#features`);
const LANG_KEY = "cowork.site-lang";
const THEME_KEY = "cowork.site-theme";
type Theme = "light" | "dark";
type ThemePreference = Theme | "system";

const UI = {
  es: {
    title: "Novedades · Cowork",
    description: "Qué trae cada versión de Cowork, el espacio para coordinar proyectos, tareas y la actividad del equipo.",
    home: "Inicio",
    features: "Funciones",
    docs: "Documentación",
    news: "Novedades",
    open: "Abrir Cowork",
    theme: "Tema",
    lightMode: "Usar tema claro",
    darkMode: "Usar tema oscuro",
    systemMode: "Seguir el tema del sistema",
    otherLang: "Switch to English",
    eyebrow: "Novedades",
    heading: "Cada versión, función por función.",
    sub: "Lo que ha cambiado en Cowork, de lo más nuevo a lo más antiguo. El detalle técnico está en el CHANGELOG.",
    index: "Versiones",
    next: "Próxima versión",
    nextDate: "En camino",
    inDevelopment: "En desarrollo",
    kind: { grande: "Grande", feature: "Feature", arreglo: "Arreglo", proxima: "Próxima" } satisfies Record<ReleaseKind | "proxima", string>,
    added: "Nuevo",
    changed: "Cambios",
    fixed: "Arreglos",
    changelog: "Leer el CHANGELOG completo",
    back: "Volver al inicio",
    motto: "Un espacio compartido para coordinar proyectos, tareas y la actividad de tu equipo.",
    footer: "Pie de página",
    product: "Producto",
    oss: "Código abierto",
    repo: "Repositorio en GitHub",
    notes: "Notas de la versión",
    changes: "Changelog",
    bug: "Reportar un fallo",
    license: "Licencia MIT",
    who: "Quién lo hace",
    author: <>Diseñada y programada por <b>CodeSentry - Tykillita</b>, desarrollo de software y ciberseguridad.</>,
    notice: "Cowork es un proyecto independiente. Cada instalación conecta su propio proyecto de Firebase: esta página no muestra información de ningún equipo.",
    version: (version: string) => `Versión ${version}`,
    language: "Idioma",
    date: (value: string) => new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)).replace(".", ""),
  },
  en: {
    title: "What's new · Cowork",
    description: "What each version of Cowork brings, the space to coordinate projects, tasks and team activity.",
    home: "Home",
    features: "Features",
    docs: "Documentation",
    news: "What's new",
    open: "Open Cowork",
    theme: "Theme",
    lightMode: "Use light theme",
    darkMode: "Use dark theme",
    systemMode: "Follow system theme",
    otherLang: "Cambiar a español",
    eyebrow: "What's new",
    heading: "Every version, feature by feature.",
    sub: "What has changed in Cowork, newest first. The technical detail is in the CHANGELOG.",
    index: "Versions",
    next: "Next version",
    nextDate: "On the way",
    inDevelopment: "In development",
    kind: { grande: "Major", feature: "Feature", arreglo: "Fix", proxima: "Next" } satisfies Record<ReleaseKind | "proxima", string>,
    added: "New",
    changed: "Changes",
    fixed: "Fixes",
    changelog: "Read the full CHANGELOG",
    back: "Back to home",
    motto: "A shared space to coordinate your team's projects, tasks and activity.",
    footer: "Footer",
    product: "Product",
    oss: "Open source",
    repo: "Repository on GitHub",
    notes: "Release notes",
    changes: "Changelog",
    bug: "Report a bug",
    license: "MIT license",
    who: "Who makes it",
    author: <>Designed and built by <b>CodeSentry - Tykillita</b>, software development and cybersecurity.</>,
    notice: "Cowork is an independent project. Each installation connects its own Firebase project: this page shows no information about any team.",
    version: (version: string) => `Version ${version}`,
    language: "Language",
    date: (value: string) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)),
  },
} as const;

function readStored<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value as T) ? value as T : null;
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* the choice lasts until reload */ }
}

/** Without a saved choice: the browser's language and the system theme. */
function initialLang(): Lang {
  return readStored(LANG_KEY, ["es", "en"] as const) ?? (navigator.language.toLowerCase().startsWith("es") ? "es" : "en");
}

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function initialThemePreference(): ThemePreference {
  return readStored(THEME_KEY, ["light", "dark", "system"] as const) ?? "system";
}

export function ChangelogPage() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [themePreference, setThemePreference] = useState<ThemePreference>(initialThemePreference);
  const [systemThemeValue, setSystemThemeValue] = useState<Theme>(systemTheme);
  const theme = themePreference === "system" ? systemThemeValue : themePreference;
  const t = UI[lang];
  const text = (value: Text) => value[lang];
  const hasNext = NEXT.added.length + NEXT.changed.length + NEXT.fixed.length > 0;

  useEffect(() => {
    if (themePreference !== "system") return;
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!media) return;
    const syncTheme = () => setSystemThemeValue(media.matches ? "light" : "dark");
    syncTheme();
    media.addEventListener("change", syncTheme);
    return () => media.removeEventListener("change", syncTheme);
  }, [themePreference]);

  // The page paints the whole window, also under the browser bars.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.site = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#ffffff" : "#08090b");
    return () => { delete root.dataset.site; };
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", t.description);
    return () => { document.documentElement.lang = "es"; };
  }, [lang, t]);

  // A link to a version (/novedades#v0-1-0) lands on it once the page is drawn.
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, []);

  function chooseLang(next: Lang) {
    setLang(next);
    store(LANG_KEY, next);
  }

  function chooseTheme(next: ThemePreference) {
    setThemePreference(next);
    store(THEME_KEY, next);
  }

  const groups = (entry: { added: ReleaseItem[]; changed: ReleaseItem[]; fixed: ReleaseItem[] }) => ([
    ["added", t.added, entry.added],
    ["changed", t.changed, entry.changed],
    ["fixed", t.fixed, entry.fixed],
  ] as const).filter(([, , items]) => items.length > 0).map(([key, label, items]) => <div className="siteGroup" key={key}>
    <h3>{label}</h3>
    <div className="siteItems">
      {items.map((item) => <div className={`siteItem${item.wide ? " isWide" : ""}`} key={item.title.es}>
        <b>{text(item.title)}</b>
        <span>{text(item.body)}</span>
      </div>)}
    </div>
  </div>);

  const release = (entry: Release) => <article className="siteVersion" id={releaseAnchor(entry.version)} key={entry.version}>
    <div className="siteVersionMeta">
      <div className="siteVersionNumber">{entry.version}</div>
      <span className="siteVersionDate">{entry.released ? t.date(entry.date) : t.inDevelopment}</span>
      <span className={`siteKind is-${entry.kind}`}>{t.kind[entry.kind]}</span>
    </div>
    <div className="siteVersionBody">
      <p>{text(entry.summary)}</p>
      {groups(entry)}
    </div>
  </article>;

  return <div className="site" data-theme={theme}>
    <header className="siteNav">
      <div className="siteContainer">
        <a className="siteBrand" href="/"><span className="siteBrandMark"><CoworkMark /></span>Cowork</a>
        <div className="siteNavActions">
          <div className="siteThemeControl" role="group" aria-label={t.theme}>
            <button className={`siteIconButton${themePreference === "light" ? " isActive" : ""}`} type="button" onClick={() => chooseTheme("light")} aria-label={t.lightMode} aria-pressed={themePreference === "light"}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            </button>
            <button className={`siteIconButton${themePreference === "dark" ? " isActive" : ""}`} type="button" onClick={() => chooseTheme("dark")} aria-label={t.darkMode} aria-pressed={themePreference === "dark"}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
            </button>
            <button className={`siteIconButton${themePreference === "system" ? " isActive" : ""}`} type="button" onClick={() => chooseTheme("system")} aria-label={t.systemMode} aria-pressed={themePreference === "system"}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
            </button>
          </div>
          <button className="siteIconButton siteLangButton" type="button" onClick={() => chooseLang(lang === "es" ? "en" : "es")} aria-label={t.otherLang}>{lang === "es" ? "EN" : "ES"}</button>
          <a className="siteIconButton siteNavGitHub" href={REPO} aria-label="GitHub"><GitHubMark /></a>
          <a className="siteButton isSmall siteNavOpen" href="/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></svg><span>{t.open}</span></a>
        </div>
      </div>
    </header>

    <main>
      <section className="siteHero">
        <div className="siteContainer">
          <p className="siteEyebrow">{t.eyebrow}</p>
          <h1>{t.heading}</h1>
          <p className="siteHeroSub">{t.sub}</p>
          <nav className="siteIndex" aria-label={t.index}>
            {hasNext && <a href="#proxima">{t.next}</a>}
            {RELEASES.map((entry) => <a key={entry.version} href={`#${releaseAnchor(entry.version)}`}>{entry.version}</a>)}
          </nav>
        </div>
      </section>

      {/* Rule (AGENTS.md): every version or new feature adds its entry in releases.ts, in both languages. */}
      <section className="siteContainer">
        <div className="siteTimeline">
          {hasNext && <article className="siteVersion isNext" id="proxima">
            <div className="siteVersionMeta">
              <div className="siteVersionNumber">{t.next}</div>
              <span className="siteVersionDate">{t.nextDate}</span>
              <span className="siteKind is-proxima">{t.kind.proxima}</span>
            </div>
            <div className="siteVersionBody">
              {text(NEXT.summary) && <p>{text(NEXT.summary)}</p>}
              {groups(NEXT)}
            </div>
          </article>}
          {RELEASES.map(release)}
          <p className="siteCta">
            <a className="siteButton isQuiet" href={`${REPO}/blob/main/CHANGELOG.md`}>{t.changelog}</a>
            <a className="siteLink" href="/">{t.back}</a>
          </p>
        </div>
      </section>
    </main>

    <footer className="siteFooter">
      <div className="siteContainer">
        <div className="siteFooterTop">
          <div className="siteFooterBrand">
            <a className="siteFooterLogo" href="/"><span className="siteBrandMark"><CoworkMark /></span><span>Cowork</span></a>
            <p className="siteFooterMotto">{t.motto}</p>
            <a className="siteButton isSmall" href="/"><span>{t.open}</span></a>
          </div>
          <nav className="siteFooterColumns" aria-label={t.footer}>
            <div className="siteFooterColumn">
              <h2>{t.product}</h2>
              <ul>
                <li><a href="/">{t.home}</a></li>
                <li><a href="/novedades">{t.news}</a></li>
                <li><a href={featuresUrl(lang)}>{t.features}</a></li>
                <li><a href={`${REPO}/tree/main/docs`}>{t.docs}</a></li>
              </ul>
            </div>
            <div className="siteFooterColumn">
              <h2>{t.oss}</h2>
              <ul>
                <li><a href={REPO}>{t.repo}</a></li>
                <li><a href={`${REPO}/releases/tag/v${LATEST.version}`}>{t.notes}</a></li>
                <li><a href={`${REPO}/blob/main/CHANGELOG.md`}>{t.changes}</a></li>
                <li><a href={`${REPO}/issues/new`}>{t.bug}</a></li>
                <li><a href={`${REPO}/blob/main/LICENSE`}>{t.license}</a></li>
              </ul>
            </div>
            <div className="siteFooterColumn">
              <h2>{t.who}</h2>
              <p className="siteFooterAuthor">{t.author}</p>
              <ul className="siteFooterSocial">
                <li><a href="https://github.com/Tykillita"><GitHubMark /><span>Tykillita</span></a></li>
                <li><a href={REPO}><GitHubMark /><span>Cowork</span></a></li>
              </ul>
              <a className="siteFooterCompany" href="https://github.com/Tykillita">CodeSentry - Tykillita</a>
            </div>
          </nav>
        </div>
        <div className="siteFooterBottom">
          <p className="siteFooterNotice">{t.notice}</p>
          <div className="siteFooterRow">
            <span>© 2026 CodeSentry - Tykillita · {t.version(__APP_VERSION__)}</span>
            <nav className="siteFooterLang" aria-label={t.language}>
              <button type="button" aria-current={lang === "es"} onClick={() => chooseLang("es")}>Español</button>
              <button type="button" aria-current={lang === "en"} onClick={() => chooseLang("en")}>English</button>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  </div>;
}
