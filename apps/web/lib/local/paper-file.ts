import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localDir } from "./paths";

/** Load the on-disk paper book, or null when local web is off or the file is missing or unusable. */
export function loadPaperBlob(): unknown | null {
  const dir = localDir();
  if (!dir) return null;
  const file = path.join(dir, "paper.json");
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { strategies?: unknown };
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.strategies)) return null;
    return parsed;
  } catch {
    return null;
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let last = "";

/** Best-effort save. No-op outside local web. Skips the write when nothing changed. */
export function schedulePaperSave(state: unknown): void {
  const dir = localDir();
  if (!dir) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    try {
      const text = JSON.stringify(state);
      if (text === last) return;
      last = text;
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "paper.json");
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, text);
      renameSync(tmp, file);
    } catch {
      /* a full disk should not take the paper screens down */
    }
  }, 250);
}
