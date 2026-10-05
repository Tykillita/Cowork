import { useEffect, useState } from "react";
import type { FileDraft } from "../../types";
import { getBlobRaw } from "../github/githubApi";
import { draftBytes, readFileDraftContent } from "./fileDrafts";
import { decodeText, imageType, MAX_VIEW_BYTES, type TreeNode } from "./repoTree";

export type FileContent =
  | { kind: "loading" }
  | { kind: "text"; text: string }
  /** `text` is the source of an SVG, which can also be read as code. */
  | { kind: "image"; url: string; text?: string }
  | { kind: "binary" }
  | { kind: "large"; size: number }
  | { kind: "error"; message: string };

/**
 * Content of one file by its blob SHA (cached for good). Images are shown from
 * a blob URL; other binaries and files over 1 MB are only offered on GitHub.
 */
export function useFileContent(repoPath: string, file: TreeNode | null, token: string | null): FileContent | null {
  const [content, setContent] = useState<FileContent | null>(null);
  useEffect(() => {
    if (!file || file.kind !== "file" || !repoPath || token === null) { setContent(null); return; }
    if (file.size > MAX_VIEW_BYTES) { setContent({ kind: "large", size: file.size }); return; }
    let active = true;
    let objectUrl = "";
    setContent({ kind: "loading" });
    getBlobRaw(repoPath, file.sha, token || undefined).then((buffer) => {
      if (!active) return;
      const type = imageType(file.path);
      if (type) {
        objectUrl = URL.createObjectURL(new Blob([buffer], { type }));
        const decoded = type === "image/svg+xml" ? decodeText(buffer) : null;
        setContent({ kind: "image", url: objectUrl, text: decoded && "text" in decoded ? decoded.text : undefined });
        return;
      }
      const decoded = decodeText(buffer);
      setContent("text" in decoded ? { kind: "text", text: decoded.text } : { kind: "binary" });
    }).catch((reason) => {
      if (active) setContent({ kind: "error", message: reason instanceof Error ? reason.message : "No se pudo abrir el archivo." });
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, repoPath, token]);
  return content;
}

/** Content of a proposed file, read from Cowork instead of GitHub. */
export function useDraftContent(projectId: string, draft: Pick<FileDraft, "id" | "path" | "encoding"> | null): FileContent | null {
  const [content, setContent] = useState<FileContent | null>(null);
  const id = draft?.id ?? "";
  const path = draft?.path ?? "";
  const encoding = draft?.encoding ?? "utf-8";
  useEffect(() => {
    if (!id) { setContent(null); return; }
    let active = true;
    let objectUrl = "";
    setContent({ kind: "loading" });
    readFileDraftContent(projectId, id).then((raw) => {
      if (!active) return;
      const type = imageType(path);
      if (type) {
        const bytes = draftBytes(encoding, raw);
        objectUrl = URL.createObjectURL(new Blob([bytes], { type }));
        const decoded = type === "image/svg+xml" ? decodeText(bytes.buffer as ArrayBuffer) : null;
        setContent({ kind: "image", url: objectUrl, text: decoded && "text" in decoded ? decoded.text : undefined });
      } else setContent(encoding === "utf-8" ? { kind: "text", text: raw } : { kind: "binary" });
    }).catch((reason) => {
      if (active) setContent({ kind: "error", message: reason instanceof Error ? reason.message : "No se pudo abrir el archivo propuesto." });
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [encoding, id, path, projectId]);
  return content;
}
