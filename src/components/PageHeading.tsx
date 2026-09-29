export function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="pageHeading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="pageDescription">{description}</p>
    </header>
  );
}
