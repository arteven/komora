import { loadBox } from "../box/index.js";
import { rebuild } from "../box/backend/rebuild.js";

export interface RebuildOpts {
  manifest?: string;
}

export async function rebuildCmd(opts: RebuildOpts): Promise<void> {
  const box = await loadBox(opts.manifest);
  await rebuild(box);
}
