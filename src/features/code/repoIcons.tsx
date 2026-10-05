/** Line icons of the repository toolbar, drawn on a 16 px grid in `currentColor`. */
const ICONS = {
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  branch: <><circle cx="5" cy="3.5" r="1.6" /><circle cx="5" cy="12.5" r="1.6" /><circle cx="11" cy="4" r="1.6" /><path d="M5 5.1v5.8M11 5.6v.4a3 3 0 0 1-3 3H5" /></>,
  tag: <><path d="M2.5 3.5v4l6 6 5-5-6-6h-4a1 1 0 0 0-1 1Z" /><circle cx="5.5" cy="5.5" r="1" /></>,
  search: <><circle cx="7" cy="7" r="4.25" /><path d="m10.25 10.25 3.25 3.25" /></>,
  plus: <path d="M8 3v10M3 8h10" />,
  refresh: <><path d="M13.25 8A5.25 5.25 0 1 1 11.7 4.3" /><path d="M13 2.25v3h-3" /></>,
  code: <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />,
  caret: <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />,
  check: <path d="m3.5 8.5 3 3 6-7" />,
  copy: <><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></>,
  download: <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />,
  upload: <path d="M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13.5h10" />,
  external: <path d="M9.5 2.5h4v4M13.5 2.5l-6 6M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />,
  filePlus: <><path d="M9 2.5H4.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V6L9 2.5Z" /><path d="M9 2.5V6h3.5M8 7.75v4M6 9.75h4" /></>,
  terminal: <><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="m4.75 6.25 2 1.75-2 1.75M8.5 10h2.75" /></>,
};

export type RepoIconName = keyof typeof ICONS;

export function RepoIcon({ name, className }: { name: RepoIconName; className?: string }) {
  return <svg className={className ? `repoIcon ${className}` : "repoIcon"} viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ICONS[name]}</svg>;
}

/** GitHub's mark (Octicons, MIT), filled with `currentColor`. */
export function GitHubMark({ className = "" }: { className?: string }) {
  return <svg className={`ghMark${className ? ` ${className}` : ""}`} viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M8 0c4.42 0 8 3.58 8 8a8.01 8.01 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A8 8 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
  </svg>;
}
