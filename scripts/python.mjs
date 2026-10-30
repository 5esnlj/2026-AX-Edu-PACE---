import { existsSync } from "node:fs";

const localPython =
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python";
export const python = existsSync(localPython)
  ? localPython
  : process.platform === "win32"
    ? "python"
    : "python3";
