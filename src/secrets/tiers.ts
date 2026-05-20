import type { ResolvedBox, WorkloadSecret, IdentitySecret } from "../box/types.js";

export interface Tiers {
  workload: WorkloadSecret[];
  identity: IdentitySecret[];
}

export function classify(r: ResolvedBox): Tiers {
  return { workload: r.secrets.workload, identity: r.secrets.identity };
}

export function hasWorkload(r: ResolvedBox): boolean {
  return r.secrets.workload.length > 0;
}

export function hasSshAgent(r: ResolvedBox): boolean {
  return r.secrets.identity.includes("ssh-agent");
}
