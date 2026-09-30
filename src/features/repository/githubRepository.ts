export function githubRepository(value: string) {
  try {
    const url = new URL(value);
    const [owner, repository, ...rest] = url.pathname.split("/").filter(Boolean);
    if (url.hostname !== "github.com" || !owner || !repository || rest.length) return null;
    const name = repository.replace(/\.git$/, "");
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) return null;
    return { url: `https://github.com/${owner}/${name}`, path: `${owner}/${name}` };
  } catch {
    return null;
  }
}

export function repositoryLabel(value: string) {
  const repository = githubRepository(value);
  return repository ? new URL(repository.url).pathname.slice(1) : "";
}
