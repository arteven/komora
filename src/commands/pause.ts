import { loadBox } from "../box/index.js";
import { pause, resume } from "../box/backend/lifecycle.js";

export interface PauseOpts { manifest?: string; }

export async function pauseCmd(opts: PauseOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  await pause(b.box.name);
}

export async function resumeCmd(opts: PauseOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  await resume(b.box.name);
}
