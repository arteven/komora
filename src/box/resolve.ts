import path from "node:path";
import os from "node:os";
import { baseSnapshotName } from "../util/paths.js";
import type {
  BoxManifest,
  ResolvedBox,
  Mount,
  PersonalLayer,
} from "./types.js";

function home(): string {
  return process.env.HOME ?? os.homedir();
}

function expandTilde(p: string): string {
  if (p === "~") return home();
  if (p.startsWith("~/")) return path.join(home(), p.slice(2));
  return p;
}

function resolveMount(m: Mount): Mount {
  return { ...m, host: expandTilde(m.host) };
}

function resolvePersonalLayer(pl: PersonalLayer): PersonalLayer {
  if ("mount" in pl && pl.mount) {
    return { mount: resolveMount(pl.mount) };
  }
  return { volume: pl.volume! };
}

export function resolveManifest(m: BoxManifest): ResolvedBox {
  const ssh = m.box.ssh
    ? { ...m.box.ssh, authorizedKeysFromHost: expandTilde(m.box.ssh.authorizedKeysFromHost) }
    : null;

  return {
    version: 1,
    image: {
      base: m.image.base,
      toolchains: m.image.toolchains ?? [],
      agents: m.image.agents ?? [],
      packages: m.image.packages ?? [],
    },
    box: {
      name: m.box.name,
      resources: m.box.resources ?? {},
      personalLayer: resolvePersonalLayer(m.box.personalLayer),
      volumes: m.box.volumes ?? [],
      mounts: (m.box.mounts ?? []).map(resolveMount),
      ports: m.box.ports ?? [],
      network: m.box.network ?? { policy: "nonlocal" },
      ssh,
      identity: m.box.identity ?? { forwardSshAgent: false },
      features: {
        docker: m.box.features?.docker ?? false,
        clipboard: m.box.features?.clipboard ?? false,
      },
    },
    secrets: {
      workload: m.secrets?.workload ?? [],
      identity: m.secrets?.identity ?? [],
    },
    baseSnapshotName: baseSnapshotName(),
  };
}
