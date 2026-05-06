import { sdk } from "./_sdk.js";
import type { Mount } from "../config/types.js";

export type SandboxStatus = "running" | "stopped" | "missing";

export interface CreateInput {
  name: string;
  image: string;
  mounts: Mount[];
  env: Record<string, string>;
  secretArgs: string[];
  raw: Record<string, unknown>;
}

export interface ListItem {
  name: string;
  status: "running" | "stopped";
}

export interface ExecCommand {
  command: string;
  args: string[];
}

export const msb = {
  execCommand(sandbox: string, cmd: string, args: string[]): ExecCommand {
    return { command: "msb", args: ["exec", sandbox, cmd, ...args] };
  },
  async create(input: CreateInput): Promise<{ id: string }> {
    return sdk.create(input);
  },
  async start(name: string): Promise<void> {
    return sdk.start(name);
  },
  async stop(name: string): Promise<void> {
    return sdk.stop(name);
  },
  async rm(name: string): Promise<void> {
    return sdk.rm(name);
  },
  async list(): Promise<ListItem[]> {
    return sdk.list();
  },
  async status(name: string): Promise<SandboxStatus> {
    const items = await sdk.list();
    const found = items.find((i) => i.name === name);
    if (!found) return "missing";
    return found.status;
  },
  async execInSandbox(sandbox: string, scriptPath: string, args: string[]): Promise<void> {
    const { execa } = await import("execa");
    await execa("msb", ["exec", sandbox, "bash", scriptPath, ...args], { stdio: "inherit" });
  },
};
