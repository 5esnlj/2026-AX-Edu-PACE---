import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Browser tests never write to the development database.
const folder = mkdtempSync(join(tmpdir(), "ieum-e2e-"));
const child = spawn(process.execPath, ["scripts/dev.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    IEUM_DB_PATH: join(folder, "test.db"),
    IEUM_API_PORT: "8001",
    IEUM_WEB_PORT: "5174",
  },
});
const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => {
  rmSync(folder, { recursive: true, force: true });
  process.exitCode = code || 0;
});
