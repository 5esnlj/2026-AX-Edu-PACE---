import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { python } from "./python.mjs";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const apiPort = process.env.IEUM_API_PORT || "8000";
const webPort = process.env.IEUM_WEB_PORT || "5173";
for (const port of [apiPort, webPort]) {
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
    throw new Error(
      "IEUM_API_PORT / IEUM_WEB_PORT must be ports between 1024 and 65535.",
    );
  }
}
const children = [
  spawn(
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
      apiPort,
      "--reload",
      "--reload-dir",
      "backend",
    ],
    { stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0", "--port", webPort],
    { stdio: "inherit" },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill("SIGTERM"));
  process.exitCode = code;
}
children.forEach((child) => {
  child.on("error", (error) => {
    console.error(error);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 1);
  });
});
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
