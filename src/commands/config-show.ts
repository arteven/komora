import yaml from "js-yaml";
import { loadResolvedConfig } from "../config/index.js";

export interface ShowOpts {
  agent: string;
  profile?: string;
  workspaceDir: string;
  json: boolean;
}

export async function configShow(opts: ShowOpts): Promise<void> {
  const cfg = await loadResolvedConfig({
    workspaceDir: opts.workspaceDir,
    agentOverride: opts.agent,
    profileOverride: opts.profile,
  });
  if (opts.json) process.stdout.write(`${JSON.stringify(cfg, null, 2)}\n`);
  else process.stdout.write(yaml.dump(cfg));
}
