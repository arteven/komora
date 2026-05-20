import { getSecret } from "./keychain.js";
import type { WorkloadSecret } from "../box/types.js";

export interface ResolvedWorkload {
  [name: string]: { value: string; domain: string };
}

export async function collectWorkloadValues(workload: WorkloadSecret[]): Promise<ResolvedWorkload> {
  const out: ResolvedWorkload = {};
  for (const w of workload) {
    const v = await getSecret(w.name);
    if (v !== undefined) out[w.name] = { value: v, domain: w.domain };
  }
  return out;
}

export async function missingWorkload(workload: WorkloadSecret[]): Promise<string[]> {
  const out: string[] = [];
  for (const w of workload) {
    if ((await getSecret(w.name)) === undefined) out.push(w.name);
  }
  return out;
}

export function buildSecretEnvArgs(values: ResolvedWorkload): string[] {
  const args: string[] = [];
  for (const [name, { value, domain }] of Object.entries(values)) {
    args.push("--secret", `${name}=${value}@${domain}`);
  }
  return args;
}
