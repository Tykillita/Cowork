export function CoworkMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 5.5v4a3 3 0 0 0 3 3h5a3 3 0 0 1 3 3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 18.5v-3a3 3 0 0 1 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6.5" cy="4.5" r="2" fill="currentColor" />
      <circle cx="6.5" cy="19.5" r="2" fill="currentColor" />
      <circle cx="17.5" cy="19.5" r="2" fill="currentColor" />
    </svg>
  );
}
