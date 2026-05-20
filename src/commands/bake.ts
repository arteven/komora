import { loadBox } from "../box/index.js";
import { bake } from "../box/backend/image.js";

export interface BakeOpts {
  manifest?: string;
}

export async function bakeCmd(opts: BakeOpts): Promise<void> {
  const box = await loadBox(opts.manifest);
  await bake(box);
}
