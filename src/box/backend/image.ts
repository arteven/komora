import { Sandbox } from "microsandbox";
import path from "node:path";
import url from "node:url";
import { runMsb } from "./msb.js";
import { composeRecipe } from "../../baker/recipe.js";
import type { ResolvedBox } from "../types.js";
import { log } from "../../util/log.js";

const THROWAWAY = "komora-bake";

function installScriptsDir(): string {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "baker", "install");
}

export async function bake(r: ResolvedBox): Promise<void> {
  log.info(`baking base image from ${r.image.base}`);

  let builder: any = Sandbox.builder(THROWAWAY).image(r.image.base);
  if (r.box.resources.memoryMib) builder = builder.memory(r.box.resources.memoryMib);
  if (r.box.resources.cpus) builder = builder.cpus(r.box.resources.cpus);

  builder = builder.volume("/opt/komora/install", (b: any) => b.bind(installScriptsDir()));

  if (r.box.ssh?.enabled) {
    builder = builder.volume("/opt/komora/authorized_keys", (b: any) => b.bind(r.box.ssh!.authorizedKeysFromHost));
  }

  const sandbox: any = await builder.create();
  try {
    const recipe = composeRecipe(r);
    const res = await sandbox.shell(recipe);
    if (!res.success) {
      const err = res.stderr?.() ?? "";
      throw new Error(`bake recipe failed (exit ${res.code}): ${err}`);
    }
    await sandbox.stop();
    await runMsb(["snapshot", "create", "--force", r.baseSnapshotName, "--from", THROWAWAY], { stdio: "inherit" });
  } finally {
    // Use msb CLI for stop+remove to avoid SDK race between stop and remove
    await runMsb(["stop", THROWAWAY], { stdio: "pipe" }).catch(() => {});
    await runMsb(["remove", THROWAWAY], { stdio: "pipe" }).catch(() => {});
  }
}
