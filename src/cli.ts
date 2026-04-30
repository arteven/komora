#!/usr/bin/env node
import { Command } from "commander";
import { secretsSet, secretsList, secretsRm } from "./commands/secrets.js";

const program = new Command();
program.name("komora").description("Per-workspace microVM sandboxes for AI agents.").version("0.0.0");

const secrets = program.command("secrets").description("Manage the komora secret store.");
secrets.command("set <name>").option("--from-stdin", "read value from stdin").action((name, opts) => secretsSet(name, opts));
secrets.command("list").action(() => secretsList());
secrets.command("rm <name>").action((name) => secretsRm(name));

program.parseAsync(process.argv);
