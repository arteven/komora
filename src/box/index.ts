import { loadManifest } from "./load.js";
import { resolveManifest } from "./resolve.js";
import { manifestFile } from "../util/paths.js";
import type { ResolvedBox } from "./types.js";

export type { BoxManifest, ResolvedBox } from "./types.js";

export async function loadBox(filePath?: string): Promise<ResolvedBox> {
  const p = filePath ?? manifestFile();
  const m = await loadManifest(p);
  return resolveManifest(m);
}
