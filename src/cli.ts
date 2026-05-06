#!/usr/bin/env node
import { Command } from "commander";
import { secretsSet, secretsList, secretsRm } from "./commands/secrets.js";
import { ls } from "./commands/ls.js";
import { stop } from "./commands/stop.js";
import { rm } from "./commands/rm.js";
import { exec as execCmd } from "./commands/exec.js";
import { create } from "./commands/create.js";
import { start } from "./commands/start.js";
import { run } from "./commands/run.js";
import { logs } from "./commands/logs.js";

const program = new Command();
program.name("komora").description("Per-workspace microVM sandboxes for AI agents.").version("0.2.0");

const secrets = program.command("secrets").description("Manage the komora secret store.");
secrets.command("set <name>").option("--from-stdin", "read value from stdin").action((name, opts) => secretsSet(name, opts));
secrets.command("list").action(() => secretsList());
secrets.command("rm <name>").action((name) => secretsRm(name));

program.command("ls").description("List sandboxes.").action(() => ls());
program.command("stop <name>").description("Stop a running sandbox.").action((n) => stop(n));
program.command("rm <name>").description("Remove a sandbox.").action((n) => rm(n));

program
  .command("exec <name> <cmd> [args...]")
  .description("Run a command in a running sandbox (strict).")
  .action(async (name, cmd, args: string[] = []) => {
    process.exit(await execCmd(name, cmd, args));
  });

program
  .command("create <agent>")
  .option("--bare", "Strip agent defaults (auth volumes, default secrets, default domains)")
  .option("--name <override>", "Override sandbox name")
  .option("--verbose", "Show init sequence output")
  .description("Create a sandbox without running an agent.")
  .action((agent, opts) => create({ agent, name: opts.name, bare: !!opts.bare, verbose: !!opts.verbose, workspaceDir: process.cwd() }));

program.command("start <name>").description("Start a stopped sandbox.").action((n) => start(n));
program.command("logs <name>").description("Stream the agent's stderr.").action((n) => logs(n));

program
  .command("run <agent>")
  .option("--bare", "Strip agent defaults (auth volumes, default secrets, default domains)")
  .option("--dry-run", "Print resolved config without creating anything")
  .option("--name <override>", "Override sandbox name")
  .option("--verbose", "Show init sequence output")
  .allowUnknownOption(true)
  .description("Find-or-create the sandbox and run the agent (everything after `--` is forwarded).")
  .action(async (agent, opts, command) => {
    const argv = command.args;
    process.exit(
      await run({
        agent,
        name: opts.name,
        bare: !!opts.bare,
        dryRun: !!opts.dryRun,
        verbose: !!opts.verbose,
        argv,
        workspaceDir: process.cwd(),
      }),
    );
  });

program.parseAsync(process.argv);
