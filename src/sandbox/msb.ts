import type { Sandbox } from "microsandbox";
import { sdk } from "./_sdk.js";
import type { VolumeInfo } from "./_sdk.js";
import type { Mount } from "../config/types.js";

export type { VolumeInfo };

export type SandboxStatus = "running" | "stopped" | "missing";

export interface CreateInput {
  name: string;
  image: string;
  memoryMib?: number;
  cpus?: number;
  mounts: Mount[];
  env: Record<string, string>;
  secretArgs: string[];
  domains: string[];
  raw: Record<string, unknown>;
  scripts?: Record<string, string>;
}

export interface ListItem {
  name: string;
  status: "running" | "stopped";
}

export const msb = {
  async create(input: CreateInput): Promise<Sandbox> {
    return sdk.create(input);
  },
  async start(name: string): Promise<Sandbox> {
    return sdk.start(name);
  },
  async connect(name: string): Promise<Sandbox> {
    return sdk.connect(name);
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
  async volumeList(): Promise<VolumeInfo[]> {
    return sdk.volumeList();
  },
  async volumeRemove(name: string): Promise<void> {
    return sdk.volumeRemove(name);
  },
  async status(name: string): Promise<SandboxStatus> {
    const items = await sdk.list();
    const found = items.find((i) => i.name === name);
    if (!found) return "missing";
    return found.status;
  },
};
