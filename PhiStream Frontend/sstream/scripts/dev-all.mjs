#!/usr/bin/env node
/**
 * `npm run dev:all` -- the whole stack on ONE port.
 *
 *   http://localhost:3000          this site (Next.js)
 *   http://localhost:3000/api/...  the backend, proxied by next.config.ts
 *
 * Starts the backend's own `npm run dev` on an internal port bound to
 * loopback only (so it is not reachable on its own from the network), then
 * this site's `next dev`. Ctrl+C stops both; if either exits, so does the
 * other.
 *
 * Environment (all optional):
 *   PORT          public port for the site            default 3000
 *   BACKEND_PORT  internal backend port               default 4000
 *   BACKEND_DIR   path to the backend checkout        default ../../phistream-backend
 *                 or ../../Phistream Backend, whichever exists
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const siteDir = resolve(here, "..");
// The Phistream-Complete repo names the folder "phistream-backend" (Vercel
// function names cannot contain spaces); standalone checkouts use
// "Phistream Backend". Take whichever exists.
const backendDir = process.env.BACKEND_DIR
  ? resolve(siteDir, process.env.BACKEND_DIR)
  : ["../../phistream-backend", "../../Phistream Backend"]
      .map((dir) => resolve(siteDir, dir))
      .find((dir) => existsSync(resolve(dir, "package.json"))) ??
    resolve(siteDir, "../../phistream-backend");
const port = process.env.PORT ?? "3000";
const backendPort = process.env.BACKEND_PORT ?? "4000";
const backendUrl = `http://127.0.0.1:${backendPort}`;

if (!existsSync(resolve(backendDir, "package.json"))) {
  console.error(
    `[dev:all] No backend found at ${backendDir}. Set BACKEND_DIR to the backend folder.`,
  );
  process.exit(1);
}

const isWindows = process.platform === "win32";
const children = [];
let stopping = false;

function run(name, color, cwd, script, env) {
  const options = {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  };
  // npm is npm.cmd on Windows, which needs a shell to launch. A fixed command
  // string (no args array) keeps Node from warning about unescaped arguments.
  const child = isWindows
    ? spawn(`npm run ${script}`, { ...options, shell: true })
    : spawn("npm", ["run", script], options);
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buffered = "";
    stream.on("data", (chunk) => {
      buffered += chunk;
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? "";
      for (const line of lines) out.write(tag + line + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`${tag}exited with code ${code}; stopping the stack.`);
      stop(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // On Windows a shell-launched npm has a process tree; kill all of it.
    if (isWindows) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

// Variables set here win over the backend's .env (Node's --env-file never
// overrides the existing environment), so its .env can keep PORT=3000.
run("api", "36", backendDir, "dev", {
  PORT: backendPort,
  HOST: "127.0.0.1",
});

run("web", "33", siteDir, "dev", {
  PORT: port,
  BACKEND_URL: backendUrl,
});

console.log(
  `\n[dev:all] Site and API on http://localhost:${port}  (API docs: http://localhost:${port}/docs)\n`,
);
