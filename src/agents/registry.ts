import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import type { AgentDefinition } from "../config/types.js";
import { userAgentsDir } from "../util/paths.js";
import { claude } from "./claude.js";
import { opencode } from "./opencode.js";
import { codex } from "./codex.js";
import { gemini } from "./gemini.js";
import { copilot } from "./copilot.js";
import { shell } from "./shell.js";

export const BUILTIN_AGENTS: Record<string, AgentDefinition> = {
  claude,
  opencode,
  codex,
  gemini,
  copilot,
  shell,
};

interface UserAgentYaml {
  name: string;
  template: string;
  command: string;
  defaultArgs?: string[];
  memoryMib?: number;
  cpus?: number;
  authVolumes?: { name: string; target: string }[];
  defaultSecrets?: string[];
  defaultDomains?: string[];
}

async function loadUserAgent(name: string): Promise<AgentDefinition | null> {
  try {
    const raw = await fs.readFile(path.join(userAgentsDir(), `${name}.yaml`), "utf8");
    const parsed = yaml.load(raw) as UserAgentYaml;
    return {
      template: parsed.template,
      command: parsed.command,
      defaultArgs: parsed.defaultArgs ?? [],
      memoryMib: parsed.memoryMib,
      cpus: parsed.cpus,
      authVolumes: (parsed.authVolumes ?? []).map((v) => ({
        type: "volume" as const,
        name: v.name,
        target: v.target,
      })),
      defaultSecrets: parsed.defaultSecrets ?? [],
      defaultDomains: parsed.defaultDomains ?? [],
    };
  } catch {
    return null;
  }
}

export async function getAgent(name: string): Promise<AgentDefinition> {
  const userDef = await loadUserAgent(name);
  if (userDef) return userDef;

  const builtin = BUILTIN_AGENTS[name];
  if (builtin) return builtin;

  throw new Error(`unknown agent '${name}'. Built-in agents: ${Object.keys(BUILTIN_AGENTS).join(", ")}`);
}
