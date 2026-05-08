import { loadResolvedConfig } from "../config/index.js";
import { ensureSandbox } from "../sandbox/lifecycle.js";

export interface CreateOpts {
  agent?: string;
  name?: string;
  bare?: boolean;
  profile?: string;
  verbose?: boolean;
  workspaceDir: string;
}

export async function create(opts: CreateOpts): Promise<void> {
  const cfg = await loadResolvedConfig({
    workspaceDir: opts.workspaceDir,
    agent: opts.agent,
    nameOverride: opts.name,
    bare: opts.bare,
    profile: opts.profile,
  });
  await ensureSandbox(cfg, { verbose: opts.verbose });
}
