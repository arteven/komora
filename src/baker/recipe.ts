import type { ResolvedBox } from "../box/types.js";
import { toolchainScript } from "./toolchains.js";
import { agentScript } from "./agents.js";

export function composeRecipe(r: ResolvedBox): string {
  const lines: string[] = ["set -eu", "export HOME=/root", "apt-get update"];

  const corePkgs = ["ca-certificates", "curl", "gnupg", "git", "build-essential"];
  lines.push(`apt-get install -y ${corePkgs.join(" ")}`);

  if (r.image.packages.length > 0) {
    lines.push(`apt-get install -y ${r.image.packages.join(" ")}`);
  }

  lines.push("bash /opt/komora/install/mise.sh");

  if (r.box.ssh?.enabled) {
    const u = r.box.ssh.user;
    const k = "/opt/komora/authorized_keys";
    lines.push(`bash /opt/komora/install/sshd.sh "${u}" "${k}"`);
  }

  for (const t of r.image.toolchains) {
    lines.push(toolchainScript(t));
  }

  for (const a of r.image.agents) {
    lines.push(agentScript(a));
  }

  lines.push("apt-get clean", "rm -rf /var/lib/apt/lists/*");
  return lines.join("\n");
}
