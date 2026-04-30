#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();
program.name("komora").description("Per-workspace microVM sandboxes for AI agents.").version("0.0.0");
program.parseAsync(process.argv);
