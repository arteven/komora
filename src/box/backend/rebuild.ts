import { destroy } from "./lifecycle.js";
import { buildSandbox } from "./sdk.js";
import { boxStatus } from "./status.js";
import { waitForSshd } from "./ssh.js";
import { collectWorkloadValues, missingWorkload, buildSecretEnvArgs } from "../../secrets/inject.js";
import type { ResolvedBox } from "../types.js";
import { log } from "../../util/log.js";

export async function rebuild(r: ResolvedBox): Promise<void> {
  const status = await boxStatus(r.box.name);
  if (status !== "missing") {
    log.info(`removing existing ${r.box.name} (state=${status})`);
    await destroy(r.box.name);
  }

  const missing = await missingWorkload(r.secrets.workload);
  if (missing.length > 0) {
    log.warn(`missing workload secrets in keychain (will be skipped): ${missing.join(", ")}`);
  }

  const values = await collectWorkloadValues(r.secrets.workload);
  const secretArgs = buildSecretEnvArgs(values);

  log.info(`creating ${r.box.name} from ${r.image.base}`);
  await buildSandbox(r, { secretArgs });

  if (r.box.ssh?.enabled) {
    const port = r.box.ports.find((p) => p.guest === 22)?.host;
    if (port) {
      log.info(`waiting for sshd on host port ${port}`);
      const ok = await waitForSshd(port, 30_000);
      if (!ok) log.warn(`sshd not ready after 30s — try 'komora attach' as fallback`);
    }
  }
}
