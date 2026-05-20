#!/usr/bin/env node
import { Command } from "commander";
import { bakeCmd } from "./commands/bake.js";
import { rebuildCmd } from "./commands/rebuild.js";
import { upCmd } from "./commands/up.js";
import { downCmd } from "./commands/down.js";
import { pauseCmd, resumeCmd } from "./commands/pause.js";
import { destroyCmd } from "./commands/destroy.js";
import { sshCmd } from "./commands/ssh.js";
import { attachCmd } from "./commands/attach.js";
import { statusCmd } from "./commands/status.js";
import { logsCmd } from "./commands/logs.js";
import { setCmd, listCmd, rmCmd } from "./commands/secret.js";

const program = new Command();
program
  .name("komora")
  .description("Personal dev VM orchestrator built on microsandbox.")
  .version("0.3.0")
  .option("-m, --manifest <path>", "Path to box.yaml (default: ~/.config/komora/box.yaml)");

const opts = () => ({ manifest: program.opts().manifest });

program.command("bake").description("Build/refresh the base image.").action(() => bakeCmd(opts()));
program.command("rebuild").description("Recreate the VM from base snapshot + manifest.").action(() => rebuildCmd(opts()));
program.command("up").description("Start the VM.").action(() => upCmd(opts()));
program.command("down").description("Stop the VM.").action(() => downCmd(opts()));
program.command("pause").description("Pause the VM.").action(() => pauseCmd(opts()));
program.command("resume").description("Resume a paused VM.").action(() => resumeCmd(opts()));
program.command("destroy").description("Remove the VM (volumes preserved).").action(() => destroyCmd(opts()));
program.command("ssh").description("Connect to the VM via sshd.").action(() => sshCmd(opts()));
program.command("attach").description("Attach via 'msb exec -t bash' (fallback when sshd is down).").argument("[cmd...]").action((cmd: string[]) => attachCmd(opts(), cmd));
program.command("status").description("Show VM state, sshd readiness, attached volumes.").action(() => statusCmd(opts()));
program.command("logs").option("-f, --follow", "Stream new lines").description("Tail VM logs.").action((o) => logsCmd({ ...opts(), follow: !!o.follow }));

const sec = program.command("secret").description("Manage host-side secrets.");
sec.command("set <name>").option("--value <v>", "Inline value").option("--from-stdin", "Read value from stdin").action((n, o) => setCmd(n, o));
sec.command("list").action(() => listCmd());
sec.command("rm <name>").action((n) => rmCmd(n));

program.parseAsync(process.argv).catch((e) => {
  process.stderr.write(`komora: ${e?.message ?? e}\n`);
  process.exit(1);
});
