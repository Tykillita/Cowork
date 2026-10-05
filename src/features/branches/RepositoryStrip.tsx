import type { GitHubRepo } from "../../types";
import { Sk } from "../../components/Skeleton";
import { rateLimitFor, tokenFingerprint } from "../github/githubCache";
import { relativeTime } from "../../lib/relativeTime";

function resetLabel(reset: number) {
  return new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" }).format(new Date(reset * 1000));
}

/** The repository at a glance: name, privacy, default branch, last check and refresh. */
export function RepositoryStrip({ url, label, repo, repoReady, branchCount, branchesReady, branchesTruncated, updatedAt, loading, token, onRefresh, connect }: {
  url: string;
  label: string;
  repo: GitHubRepo | null;
  repoReady: boolean;
  branchCount: number;
  branchesReady: boolean;
  branchesTruncated: boolean;
  updatedAt: Date | null;
  loading: boolean;
  token: string;
  onRefresh: () => void;
  /** Shown while the account has no usable GitHub token. */
  connect: { label: string; busy: boolean; onClick: () => void } | null;
}) {
  const limit = rateLimitFor(tokenFingerprint(token));
  const lowLimit = limit && limit.limit > 0 && limit.remaining < limit.limit * 0.1;
  return <section className="panel repoStrip" aria-label={`Repositorio ${label}`}>
    <div className="repoStripMain">
      <p className="eyebrow">REPOSITORIO</p>
      <a className="repoStripName" href={url} target="_blank" rel="noreferrer">{label} <span aria-hidden="true">↗</span></a>
      <p className="repoStripMeta">
        {branchesReady ? <span>{branchCount} {branchCount === 1 ? "rama" : "ramas"}{branchesTruncated ? "+" : ""}{repo?.private ? " · repositorio privado" : ""}</span> : <Sk inline w="16ch" />}
        {repoReady ? repo && <span>Principal: <code>{repo.default_branch}</code></span> : <Sk inline w="12ch" />}
        {updatedAt && <span>Consulta {relativeTime(updatedAt.toISOString())}</span>}
      </p>
      {lowLimit && <p className="repoStripWarning">Quedan {limit.remaining} consultas a GitHub hasta las {resetLabel(limit.reset)}.</p>}
      {branchesTruncated && <p className="repoStripWarning">Se muestran las primeras 1000 ramas del repositorio.</p>}
    </div>
    <div className="repoStripActions">
      {connect && <button className="ghost repoConnect" type="button" onClick={connect.onClick} disabled={connect.busy}>{connect.busy ? "Conectando GitHub…" : connect.label}</button>}
      <button className="ghost repoRefresh" type="button" onClick={onRefresh} disabled={loading}>{loading ? "Actualizando…" : "Actualizar"}</button>
    </div>
  </section>;
}
