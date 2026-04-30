import { removeSandbox } from "../sandbox/lifecycle.js";
export async function rm(name: string): Promise<void> { await removeSandbox(name); }
