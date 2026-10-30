import { spawnSync } from "node:child_process";
import { python } from "./python.mjs";

const result = spawnSync(
  python,
  ["-m", "unittest", "discover", "-s", "backend/tests", "-v"],
  { stdio: "inherit" },
);
if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;
