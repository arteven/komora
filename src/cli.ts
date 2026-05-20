#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();
program.name("komora").description("Personal dev VM orchestrator.").version("0.3.0");

program.parseAsync(process.argv);
