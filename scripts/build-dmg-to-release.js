#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const releaseDir = join(root, "release");
const dmgDir = join(root, "src-tauri", "target", "release", "bundle", "dmg");
const skipBuild = process.argv.includes("--skip-build");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, CI: "false", ...(options.env ?? {}) },
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function latestDmg() {
  if (!existsSync(dmgDir)) {
    throw new Error(`DMG output directory does not exist: ${dmgDir}`);
  }

  const candidates = readdirSync(dmgDir)
    .filter((name) => name.endsWith(".dmg"))
    .map((name) => {
      const path = join(dmgDir, name);
      return { path, mtimeMs: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (candidates.length === 0) {
    throw new Error(`No DMG files found in ${dmgDir}`);
  }

  return candidates[0].path;
}

if (!skipBuild) {
  run("./node_modules/.bin/vite", ["build"]);
  run("./node_modules/.bin/tauri", [
    "build",
    "--bundles",
    "dmg",
    "--config",
    '{"build":{"beforeBuildCommand":""}}',
  ]);
}

mkdirSync(releaseDir, { recursive: true });
const source = latestDmg();
const target = join(releaseDir, basename(source));
copyFileSync(source, target);
console.log(`DMG copied to ${target}`);
