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

const program = new Command();
program.name("komora").description("Per-workspace microVM sandboxes for AI agents.").version("0.0.0");

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
  .command("create [agent]")
  .option("--profile <name>")
  .option("--name <override>")
  .description("Create a sandbox without running an agent.")
  .action((agent, opts) => create({ agent, profile: opts.profile, name: opts.name, workspaceDir: process.cwd() }));
program.command("start <name>").description("Start a stopped sandbox.").action((n) => start(n));

program
  .command("run [agent]")
  .option("--profile <name>")
  .option("--name <override>")
  .allowUnknownOption(true)
  .description("Find-or-create the sandbox and run the agent (everything after `--` is forwarded).")
  .action(async (agent, opts, command) => {
    const argv = command.args.slice(1); // arguments after [agent]
    process.exit(await run({ agent, profile: opts.profile, name: opts.name, argv, workspaceDir: process.cwd() }));
  });

program.parseAsync(process.argv);
