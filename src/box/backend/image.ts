import { Sandbox, type PullProgressCreate } from "microsandbox";
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

  let builder: any = Sandbox.builder(THROWAWAY);

  if (r.box.resources.upperSizeMib) {
    builder = builder.imageWith((i: any) =>
      i.oci(r.image.base).upperSize(r.box.resources.upperSizeMib!),
    );
  } else {
    builder = builder.image(r.image.base);
  }

  if (r.box.resources.memoryMib) builder = builder.memory(r.box.resources.memoryMib);
  if (r.box.resources.cpus) builder = builder.cpus(r.box.resources.cpus);

  builder = builder.volume("/opt/komora/install", (b: any) => b.bind(installScriptsDir()));

  if (r.box.ssh?.enabled) {
    builder = builder.volume("/opt/komora/authorized_keys", (b: any) => b.bind(r.box.ssh!.authorizedKeysFromHost));
  }

  const pull: PullProgressCreate = await builder.createWithPullProgress();

  // Consume progress events on a separate async track (fire-and-forget)
  const progressDone = (async () => {
    for await (const ev of pull.progress) {
      switch (ev.kind) {
        case "resolving":
          process.stderr.write(`  resolving ${ev.reference ?? ""}...\n`);
          break;
        case "resolved":
          process.stderr.write(`  resolved ${ev.layerCount ?? "?"} layers\n`);
          break;
        case "layerDownloadProgress": {
          const pct = ev.totalBytes ? ` ${Math.round(((ev.downloadedBytes ?? 0) / ev.totalBytes) * 100)}%` : "";
          process.stderr.write(`  pulling layer ${ev.digest?.slice(0, 12) ?? ""}${pct}\n`);
          break;
        }
        case "layerDownloadComplete":
          process.stderr.write(`  layer ${ev.digest?.slice(0, 12) ?? ""} done\n`);
          break;
        case "complete":
          process.stderr.write(`  pull complete (${ev.layerCount ?? "?"} layers)\n`);
          break;
      }
    }
  })();

  const sandbox: any = await pull.awaitSandbox();
  await progressDone;

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
