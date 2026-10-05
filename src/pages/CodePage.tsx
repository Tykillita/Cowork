import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { FileDraft, PanelUser, Project } from "../types";
import { FILE_DRAFT_LIMITS } from "../types";
import { PageHeading } from "../components/PageHeading";
import { FolderTree } from "../components/ui/FolderTree";
import { CodeBlock } from "../components/ui/CodeBlock";
import { FilePreview, GitHubLink, ViewSwitch } from "../components/ui/FilePreview";
import { CodeViewerSkeleton, FolderTreeSkeleton } from "../components/PageSkeletons";
import { useGitHubSession } from "../features/github/githubSession";
import { useGitHubConnect } from "../features/github/useGitHubConnect";
import { getContentSha, putFile } from "../features/github/githubApi";
import { branchAccess, branchWritePolicy } from "../features/github/branchPermissions";
import { githubRepository, repositoryLabel } from "../features/repository/githubRepository";
import { useRepository } from "../features/repository/useRepository";
import { ancestorsOf, cloneUrls, findNode, formatBytes, formatLineRange, languageFor, languageLabel, listFilePaths, mergeDrafts, parseLineRange, type TreeNode } from "../features/code/repoTree";
import { useBranchChanges, useRepoTree } from "../features/code/useRepoTree";
import { useDraftContent, useFileContent } from "../features/code/useFileContent";
import { fileIconId, folderIconId, iconUrl, useIconTheme, type IconTheme } from "../features/code/fileIcons";
import { RepoToolbar, type RepoToolbarProps } from "../features/code/RepoToolbar";
import { RepoFilesDialog } from "../features/code/RepoFilesDialog";
import { DraftReviewBar, FileDraftEditor, PendingDrafts, type ReviewAbility } from "../features/code/FileDraftEditor";
import { closeFileDraft, commitMessage, createFileDraft, draftBase64, draftPathProblem, encodeDraftContent, joinDraftPath, readFileDraftContent, rejectFileDraft, useFileDrafts, type DraftInput } from "../features/code/fileDrafts";
import { useHashParams } from "../lib/useHashRoute";

const PAGE_SIZE = 500;
type Badges = { byFile: ReadonlyMap<string, string>; folderCounts: ReadonlyMap<string, number> };

export function CodePage({ project, user, isOwner }: { project: Project; user: PanelUser; isOwner: boolean }) {
  const github = useGitHubSession(user);
  const token = github.status === "checking" ? null : github.token;
  const repository = useRepository(project.repositoryUrl, token);
  const connect = useGitHubConnect(user, github);
  const location = githubRepository(project.repositoryUrl);
  const repoPath = location?.path ?? "";
  const { params, setParams } = useHashParams();
  const defaultBranch = repository.repo?.default_branch ?? "";
  const ref = params.get("ref") || defaultBranch;
  const path = params.get("path") ?? "";
  const lines = parseLineRange(params.get("L"));
  const tree = useRepoTree(repoPath, ref, token, repository.branches, repository.branchesReady && repository.repoReady);
  const changes = useBranchChanges(repoPath, defaultBranch, ref, token);
  const drafts = useFileDrafts(location ? project.id : "");
  const [expanded, setExpanded] = useState<string[]>(() => ancestorsOf(path));
  const [shown, setShown] = useState<Record<string, number>>({});
  const [editor, setEditor] = useState<{ folder: string } | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const filesTriggerRef = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [review, setReview] = useState<{ busy: "" | "approve" | "reject" | "discard"; error: string }>({ busy: "", error: "" });
  const [dropping, setDropping] = useState(false);
  const [svgView, setSvgView] = useState<"preview" | "code">("preview");
  const icons = useIconTheme();

  const refDrafts = useMemo(() => drafts.drafts.filter((draft) => draft.ref === ref), [drafts.drafts, ref]);
  // Proposed files join the tree of their branch; `tree.version` changes when a lazy folder fills in.
  const merged = useMemo(() => (tree.root ? mergeDrafts(tree.root, refDrafts) : null), [refDrafts, tree.root, tree.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const root = merged?.root ?? null;
  const files = useMemo(() => (root ? listFilePaths(root) : []), [root]);
  const node = root && path ? findNode(root, path) : null;
  const draft = path ? refDrafts.find((entry) => entry.path === path) ?? null : null;
  const file = node?.kind === "file" ? node : null;
  const repoFile = !draft && file ? file : null;
  const repoContent = useFileContent(repoPath, repoFile, token);
  const draftContent = useDraftContent(project.id, draft);
  const content = draft ? draftContent : repoContent;
  const badges = useMemo<Badges>(() => {
    if (!merged || !merged.byFile.size) return changes;
    const folderCounts = new Map(changes.folderCounts);
    for (const [folder, count] of merged.folderCounts) folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + count);
    return { byFile: new Map([...changes.byFile, ...merged.byFile]), folderCounts };
  }, [changes, merged]);

  const isTag = repository.tags.some((tag) => tag.name === ref) && !repository.branches.some((branch) => branch.name === ref);
  const isCommit = /^[0-9a-f]{40}$/i.test(ref);
  // Proposals always go to a branch: a tag or a commit sends them to the default branch.
  const draftRef = isTag || isCommit ? defaultBranch : ref;
  const currentFolder = editor?.folder ?? (path ? path.slice(0, Math.max(0, path.lastIndexOf("/"))) : "");
  const policy = branchWritePolicy(project);
  const canReject = isOwner || policy === "members";
  const access = branchAccess({ hasRepository: true, githubStatus: github.status, repo: repository.repo, repoError: repository.repoError, policy, isOwner });
  const approval: ReviewAbility = access.allowed ? { approve: true }
    : !canReject ? { approve: false, reason: policy === "owner" ? "Lo revisa el propietario del proyecto." : "" }
    : access.reason === "not-connected" ? { approve: false, reason: "Conecta GitHub para aprobarlo y subirlo al repositorio.", connect: true }
    : access.reason === "no-push" ? { approve: false, reason: "Tu cuenta de GitHub no tiene permiso de escritura en este repositorio; puedes rechazarlo, pero no subirlo." }
    : access.reason === "repo-unavailable" ? { approve: false, reason: `No se pudo consultar el repositorio en GitHub. ${access.error}` }
    : { approve: false, reason: "" };

  // A file opened from a link reveals its folders; after a reload, open folders fill in again.
  useEffect(() => {
    if (!path) return;
    setExpanded((current) => [...new Set([...current, ...ancestorsOf(path)])]);
    // loadFolder changes with the tree; only a new path or tree should reveal again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  useEffect(() => {
    for (const folder of new Set([...expanded, ...ancestorsOf(path)])) void tree.loadFolder(folder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tree.root]);

  useEffect(() => {
    document.title = file ? `${file.name} · Código · Cowork` : "Código · Cowork";
  }, [file]);

  useEffect(() => { setReview({ busy: "", error: "" }); }, [draft?.id]);

  // Jump to the linked lines once the text is on screen.
  const lineKey = lines ? formatLineRange(lines) : "";
  useEffect(() => {
    if (!lines || content?.kind !== "text") return;
    requestAnimationFrame(() => document.querySelector(`.codeViewer .cbLine[data-line="${lines[0]}"]`)?.scrollIntoView({ block: "center" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineKey, content?.kind, path]);

  function navigate(next: { ref?: string; path?: string; L?: string }, replace = false) {
    setEditor(null);
    setParams({ ref: next.ref ?? params.get("ref") ?? "", path: next.path ?? path, L: next.L ?? "" }, { replace });
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await repository.refresh();
      tree.reload();
    } finally { setRefreshing(false); }
  }

  const pendingAt = (target: string, at = draftRef) => drafts.drafts.some((entry) => entry.ref === at && entry.path === target);
  const existsInRepo = (target: string) => (tree.root ? findNode(tree.root, target)?.kind === "file" : false);

  async function propose(input: DraftInput) {
    await createFileDraft(project.id, input, user);
    setNotice({ text: `Propusiste ${input.path}. Queda pendiente de revisión.`, tone: "info" });
    navigate({ ref: input.ref, path: input.path });
  }

  async function upload(picked: File[]) {
    const created: string[] = [];
    const skipped: string[] = [];
    setNotice(null);
    for (const item of picked) {
      const target = joinDraftPath(currentFolder, item.name);
      if (item.size > FILE_DRAFT_LIMITS.bytes) { skipped.push(`${item.name} (${formatBytes(item.size)}, más de 650 KB)`); continue; }
      if (draftPathProblem(target) || pendingAt(target)) { skipped.push(`${item.name} (${pendingAt(target) ? "ya hay una propuesta" : "nombre no válido"})`); continue; }
      try {
        const { encoding, content: body } = encodeDraftContent(await item.arrayBuffer());
        await createFileDraft(project.id, { ref: draftRef, path: target, encoding, content: body, size: item.size, message: `${existsInRepo(target) ? "Actualizar" : "Subir"} ${item.name}` }, user);
        created.push(target);
      } catch (reason) {
        skipped.push(`${item.name} (${reason instanceof Error ? reason.message : "no se pudo guardar"})`);
      }
    }
    const parts = [
      created.length ? `${created.length === 1 ? "1 archivo propuesto" : `${created.length} archivos propuestos`}; ${created.length === 1 ? "queda" : "quedan"} pendiente${created.length === 1 ? "" : "s"} de revisión.` : "",
      skipped.length ? `No se subieron: ${skipped.join(", ")}.` : "",
    ].filter(Boolean);
    setNotice({ text: parts.join(" "), tone: created.length ? "info" : "error" });
    if (created.length) navigate({ ref: draftRef, path: created[0] });
  }

  async function approve(target: FileDraft) {
    if (!github.token) return;
    setReview({ busy: "approve", error: "" });
    try {
      const raw = await readFileDraftContent(project.id, target.id);
      const sha = await getContentSha(repoPath, target.path, target.ref, github.token);
      await putFile(repoPath, { path: target.path, base64: draftBase64(target.encoding, raw), message: commitMessage(target), branch: target.ref, sha: sha || undefined }, github.token);
      await repository.refresh();
      await closeFileDraft(project.id, target, "approved", user);
      tree.reload();
      setNotice({ text: `${target.path} ya está en GitHub, en ${target.ref}.`, tone: "info" });
      setReview({ busy: "", error: "" });
    } catch (reason) {
      setReview({ busy: "", error: reason instanceof Error ? reason.message : "No se pudo subir el archivo a GitHub." });
    }
  }

  async function reject(target: FileDraft, note: string) {
    setReview({ busy: "reject", error: "" });
    try {
      await rejectFileDraft(project.id, target, note, user);
      setReview({ busy: "", error: "" });
    } catch (reason) {
      setReview({ busy: "", error: reason instanceof Error ? reason.message : "No se pudo rechazar el archivo." });
    }
  }

  async function discard(target: FileDraft) {
    setReview({ busy: "discard", error: "" });
    try {
      await closeFileDraft(project.id, target, "discarded", user);
      setNotice({ text: `Descartaste ${target.path}.`, tone: "info" });
      navigate({ path: existsInRepo(target.path) ? target.path : "", L: "" }, true);
    } catch (reason) {
      setReview({ busy: "", error: reason instanceof Error ? reason.message : "No se pudo descartar el archivo." });
    }
  }

  function onDrop(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDropping(false);
    const picked = [...event.dataTransfer.files];
    if (picked.length) void upload(picked);
  }

  if (!location) {
    return <section className="page-view" id="code" data-page="code">
      <PageHeading eyebrow="CÓDIGO DEL PROYECTO" title="Código" description="Explora los archivos del repositorio y de cada rama sin salir de Cowork." />
      <section className="panel codeEmpty">
        <h2>Este proyecto no tiene repositorio</h2>
        <p>{isOwner ? "Vincula el repositorio de GitHub para explorar sus archivos aquí." : "Cuando el propietario vincule el repositorio de GitHub, sus archivos aparecerán aquí."}</p>
        {isOwner && <a className="ghost codeEmptyAction" href="#settings-page?section=github">Vincular repositorio</a>}
      </section>
    </section>;
  }

  const repoFailed = (repository.repoReady && !repository.repo && repository.repoError) || (repository.branchesReady && !repository.branches.length && repository.branchError);
  const refreshError = !repoFailed ? repository.repoError || repository.branchError : "";
  const needsConnect = github.status === "none";
  const breadcrumb = [repositoryLabel(project.repositoryUrl), ...(file ? file.path.split("/") : [])];
  const fileIcon = file && icons ? <img src={iconUrl(fileIconId(file.name, icons))} alt="" /> : undefined;
  // Proposed files are not on GitHub yet.
  const fileLinks = file && !draft ? cloneUrls(repoPath, ref, isTag ? "tag" : "branch", file.path) : { web: "", raw: "" };
  const changeCount = changes.byFile.size;

  const toolbar: RepoToolbarProps = {
    repoPath, current: ref, defaultBranch,
    branches: repository.branches,
    branchesReady: repository.branchesReady && repository.repoReady,
    branchesTruncated: repository.branchesTruncated,
    tags: repository.tags, tagsReady: repository.tagsReady, tagsTruncated: repository.tagsTruncated,
    files, filesReady: tree.ready && Boolean(root), filesPartial: tree.lazy, icons,
    filePath: draft ? "" : file?.path ?? "", refreshing,
    extra: drafts.ready && <PendingDrafts drafts={drafts.drafts} current={ref} onOpen={(entry) => navigate({ ref: entry.ref, path: entry.path, L: "" })} />,
    onRefChange: (next) => navigate({ ref: next, path: "", L: "" }),
    onOpenFile: (next) => navigate({ path: next, L: "" }),
    onRefresh: () => void refresh(),
    onCreateFile: () => { setNotice(null); setEditor({ folder: currentFolder }); },
    onUploadFiles: (picked) => void upload(picked),
    onOpenFiles: () => setFilesOpen(true),
    filesDialogOpen: filesOpen, filesTriggerRef,
  };

  function renderTree(onOpenFile: (path: string) => void) {
    if (repoFailed) return <p className="repoEmpty" role="alert">{repository.repoError || repository.branchError}</p>;
    return !tree.ready ? <FolderTreeSkeleton /> : tree.error && !root ? <p className="repoEmpty" role="alert">{tree.error}</p> : root && root.children.length ? <>
      <FolderTree.Root
        aria-label={`Archivos de ${repositoryLabel(project.repositoryUrl)} en ${ref}`}
        expanded={expanded} onExpandedChange={setExpanded} selected={editor ? null : path || null}
        onSelect={(id) => { if (findNode(root, id)?.kind === "file") onOpenFile(id); }}
        onExpand={(id) => void tree.loadFolder(id)}
      >
        <TreeItems nodes={root.children} badges={badges} loading={tree.loading} shown={shown} icons={icons} onShowMore={(folder) => setShown((current) => ({ ...current, [folder]: (current[folder] ?? PAGE_SIZE) + PAGE_SIZE }))} />
      </FolderTree.Root>
      {tree.error && <p className="repoEmpty">{tree.error}</p>}
      {changes.deleted.length > 0 && <details className="codeDeleted"><summary>Eliminados en esta rama ({changes.deleted.length})</summary><ul>{changes.deleted.map((name) => <li key={name}><code>{name}</code></li>)}</ul></details>}
    </> : <p className="repoEmpty">El repositorio todavía no tiene archivos.</p>;
  }

  return <section className="page-view" id="code" data-page="code">
    <PageHeading eyebrow="CÓDIGO DEL PROYECTO" title="Código" description="Explora los archivos del repositorio y de cada rama sin salir de Cowork." />
    <RepoToolbar {...toolbar} />
    {filesOpen && <RepoFilesDialog toolbar={toolbar} onClose={() => setFilesOpen(false)}>
      {renderTree((next) => { setFilesOpen(false); navigate({ path: next, L: "" }); })}
    </RepoFilesDialog>}
    {connect.error && <p className="projectSettingsError" role="alert">{connect.error}</p>}
    {refreshError && <div className="codeNotice codeRepositoryNotice" role="status">
      <span>{refreshError} Se muestran los datos de la última consulta.</span>
      {needsConnect && <button className="ghost codeConnect" type="button" onClick={() => void connect.connect()} disabled={connect.connecting}>{connect.connecting ? "Conectando GitHub…" : connect.label}</button>}
    </div>}
    {notice && <p className={`codeNotice is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
      <span>{notice.text}</span>
      <button className="plain" type="button" aria-label="Cerrar aviso" onClick={() => setNotice(null)}>×</button>
    </p>}

    {repoFailed ? <section className="panel codeEmpty">
      <h2>No se pudo leer el repositorio</h2>
      <p>{repository.repoError || repository.branchError}</p>
      {needsConnect && <button className="ghost" type="button" onClick={() => void connect.connect()} disabled={connect.connecting}>{connect.connecting ? "Conectando GitHub…" : connect.label}</button>}
    </section> : <div className={`codeLayout${file || editor ? " hasFile" : ""}`}>
      <aside className="panel codeTreePanel" aria-label="Archivos">
        <div className="codeTreeHead">
          <strong>{repositoryLabel(project.repositoryUrl)}</strong>
          {ref && ref !== defaultBranch && changes.ready && changeCount > 0 && <span className="codeChangesChip" title={`${changeCount} ${changeCount === 1 ? "archivo cambiado" : "archivos cambiados"} respecto a ${defaultBranch}${changes.incomplete ? " (más de 300: las marcas pueden estar incompletas)" : ""}`}>
            {changeCount}{changes.incomplete ? "+" : ""} {changeCount === 1 ? "cambio" : "cambios"}<span className="visuallyHidden"> respecto a {defaultBranch}</span>
          </span>}
        </div>
        {renderTree(toolbar.onOpenFile)}
      </aside>

      <div className={`codeViewer${dropping ? " isDropping" : ""}`}
        onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDropping(true); } }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false); }}
        onDrop={onDrop}
      >
        {(file || editor) && <button className="plain codeBack" type="button" onClick={() => navigate({ path: "", L: "" })}>← Archivos</button>}
        {editor ? <FileDraftEditor
          key={editor.folder}
          folder={editor.folder}
          targetRef={draftRef}
          refNote={draftRef !== ref && draftRef ? "Estás viendo una etiqueta o un commit, así que se propone para la rama principal." : ""}
          exists={existsInRepo}
          pendingAt={(target) => pendingAt(target)}
          onCancel={() => setEditor(null)}
          onSubmit={propose}
        />
          : <>
            {draft && <DraftReviewBar
              key={draft.id}
              draft={draft}
              replaces={existsInRepo(draft.path)}
              canReject={canReject}
              approval={approval}
              isAuthor={draft.authorUid === user.id}
              busy={review.busy}
              error={review.error}
              onApprove={() => void approve(draft)}
              onReject={(note) => void reject(draft, note)}
              onDiscard={() => void discard(draft)}
              onConnect={() => void connect.connect()}
            />}
            {!file ? <section className="panel codeEmpty codePlaceholder">
              {!tree.ready ? <CodeViewerSkeleton /> : <>
                <h2>Elige un archivo</h2>
                <p>Abre un archivo del árbol, o búscalo con <kbd>T</kbd>, para verlo con números de línea y resaltado. Pulsa un número de línea para compartir un enlace a esa línea; con Mayúsculas, a un rango.</p>
                <p>Para proponer un archivo, usa «Añadir archivo» o arrástralo aquí: queda pendiente de revisión antes de subirse a GitHub.</p>
                {path && <p className="repoEmpty">Ese archivo no existe en <code>{ref}</code>.</p>}
              </>}
            </section>
              : !content || content.kind === "loading" ? <CodeViewerSkeleton />
              : content.kind === "text" || (content.kind === "image" && content.text !== undefined && svgView === "code") ? <CodeBlock
                key={file.path}
                files={[{ name: file.name, path: file.path, language: languageFor(file.path), code: content.kind === "text" ? content.text : content.text ?? "", icon: fileIcon }]}
                breadcrumb={breadcrumb}
                highlightLines={lines ? [lines] : []}
                onLineClick={(line, extend) => navigate({ L: extend && lines ? formatLineRange([Math.min(lines[0], line), Math.max(lines[0], line)]) : String(line) }, true)}
                headerExtra={<>
                  {content.kind === "image" && <ViewSwitch value={svgView} onChange={setSvgView} />}
                  {fileLinks.web && <GitHubLink href={fileLinks.web} />}
                </>}
              />
              : <FilePreview
                key={file.path}
                name={file.name}
                breadcrumb={breadcrumb}
                icon={fileIcon}
                kind={content.kind}
                url={content.kind === "image" ? content.url : undefined}
                size={content.kind === "large" ? content.size : file.size}
                message={content.kind === "error" ? content.message : undefined}
                typeLabel={fileTypeLabel(file.name, content.kind)}
                githubUrl={fileLinks.web}
                rawUrl={content.kind === "image" ? undefined : fileLinks.raw}
                headerExtra={content.kind === "image" && content.text !== undefined ? <ViewSwitch value={svgView} onChange={setSvgView} /> : undefined}
              />}
          </>}
        {dropping && <div className="codeDropHint" aria-hidden="true">Suelta para proponer {currentFolder ? <>en <code>{currentFolder}/</code></> : "en la raíz"}</div>}
      </div>
    </div>}
  </section>;
}

/** "Imagen PNG", "Archivo BIN" or the language of a file too large to show. */
function fileTypeLabel(name: string, kind: "image" | "binary" | "large" | "error") {
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toUpperCase() : "";
  if (kind === "image") return extension ? `Imagen ${extension}` : "Imagen";
  if (kind === "large") return languageLabel(languageFor(name));
  return extension ? `Archivo ${extension}` : "Archivo";
}

/** Decorative logo next to a name; the tree item already carries the name for assistive tech. */
function ThemeIcon({ id }: { id: string }) {
  return <img src={iconUrl(id)} alt="" width={16} height={16} loading="lazy" decoding="async" draggable={false} />;
}

function TreeItems({ nodes, badges, loading, shown, icons, onShowMore, parent = "" }: {
  nodes: TreeNode[];
  badges: Badges;
  loading: ReadonlySet<string>;
  shown: Record<string, number>;
  icons: IconTheme | null;
  onShowMore: (folder: string) => void;
  parent?: string;
}) {
  const limit = shown[parent] ?? PAGE_SIZE;
  return <>
    {nodes.slice(0, limit).map((node) => node.kind === "folder"
      ? <FolderTree.Item key={node.path} id={node.path} label={node.name} kind="folder" badge={badges.folderCounts.get(node.path)} icon={icons ? (open: boolean) => <ThemeIcon id={folderIconId(node.name, open, icons)} /> : undefined}>
        <FolderTree.Content>
          {loading.has(node.path) ? <FolderTreeSkeleton rows={3} nested /> : <TreeItems nodes={node.children} badges={badges} loading={loading} shown={shown} icons={icons} onShowMore={onShowMore} parent={node.path} />}
        </FolderTree.Content>
      </FolderTree.Item>
      : <FolderTree.Item key={node.path} id={node.path} label={node.name} kind="file" badge={badges.byFile.get(node.path)} icon={icons ? <ThemeIcon id={fileIconId(node.name, icons)} /> : undefined} />)}
    {nodes.length > limit && <div className="ftMore"><button className="plain" type="button" onClick={() => onShowMore(parent)}>Mostrar {Math.min(PAGE_SIZE, nodes.length - limit)} más ({nodes.length - limit} restantes)</button></div>}
  </>;
}
