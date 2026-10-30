import { spawn } from "node:child_process";
import { python } from "./python.mjs";

const child = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "app.main:app",
    "--app-dir",
    "backend",
    "--host",
    "127.0.0.1",
    "--port",
    process.env.IEUM_API_PORT || "8000",
  ],
  { stdio: "inherit" },
);
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code || 0;
});
