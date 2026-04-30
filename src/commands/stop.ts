import { stopSandbox } from "../sandbox/lifecycle.js";
export async function stop(name: string): Promise<void> { await stopSandbox(name); }
