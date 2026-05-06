import yaml from "js-yaml";
import { loadResolvedConfig } from "../config/index.js";
import { ensureSandbox } from "../sandbox/lifecycle.js";
import { runAgent } from "../sandbox/agent.js";

export interface RunOpts {
  agent?: string;
  name?: string;
  bare?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  argv: string[];
  workspaceDir: string;
}

export async function run(opts: RunOpts): Promise<number> {
  const cfg = await loadResolvedConfig({
    workspaceDir: opts.workspaceDir,
    agent: opts.agent,
    nameOverride: opts.name,
    bare: opts.bare,
  });

  if (opts.dryRun) {
    const { agentDef, ...printable } = cfg;
    process.stdout.write(yaml.dump(printable, { lineWidth: 120 }));
    return 0;
  }

  const sandbox = await ensureSandbox(cfg, { verbose: opts.verbose });
  return runAgent({ sandbox, agent: cfg.agent, argv: opts.argv });
}
