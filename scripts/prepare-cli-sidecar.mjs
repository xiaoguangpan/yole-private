#!/usr/bin/env node
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptDir);

let profile = "release";
let target = "";

function usage() {
  console.log(`Usage: node scripts/prepare-cli-sidecar.mjs [--profile debug|release] [--target <triple>]

Examples:
  node scripts/prepare-cli-sidecar.mjs
  node scripts/prepare-cli-sidecar.mjs --profile debug
  node scripts/prepare-cli-sidecar.mjs --target aarch64-apple-darwin`);
}

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--profile") {
    profile = args[i + 1] ?? "";
    i += 1;
  } else if (arg === "--target") {
    target = args[i + 1] ?? "";
    i += 1;
  } else if (arg === "-h" || arg === "--help") {
    usage();
    process.exit(0);
  } else if (!target) {
    target = arg;
  } else {
    console.error(`[prepare-cli-sidecar] unexpected argument: ${arg}`);
    usage();
    process.exit(2);
  }
}

if (profile !== "debug" && profile !== "release") {
  console.error("[prepare-cli-sidecar] --profile must be debug or release");
  process.exit(2);
}

if (!target && process.env.TAURI_ENV_TARGET_TRIPLE) {
  target = process.env.TAURI_ENV_TARGET_TRIPLE;
}

if (!target) {
  const result = spawnSync("rustc", ["-vV"], { encoding: "utf8" });
  if (result.status === 0) {
    const hostLine = result.stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith("host:"));
    target = hostLine?.slice("host:".length).trim() ?? "";
  }
}

if (!target) {
  console.error("[prepare-cli-sidecar] could not resolve Rust target triple");
  process.exit(1);
}

const binExt = target.includes("windows") ? ".exe" : "";
const cargoArgs = [
  "build",
  "--manifest-path",
  join(repoRoot, "core", "Cargo.toml"),
  "-p",
  "yole-cli",
  "--target",
  target,
];
if (profile === "release") {
  cargoArgs.push("--release");
}

const destDir = join(repoRoot, "core", "target", "tauri-sidecars");
const dest = join(destDir, `yole-${target}${binExt}`);
let placeholderCreated = false;

function cleanupPlaceholder() {
  if (placeholderCreated) {
    rmSync(dest, { force: true });
  }
}

try {
  if (!existsSync(dest)) {
    mkdirSync(destDir, { recursive: true });
    writeFileSync(dest, "#!/usr/bin/env sh\nexit 1\n");
    try {
      chmodSync(dest, 0o755);
    } catch {
      // Windows only needs the path to exist for Tauri validation.
    }
    placeholderCreated = true;
  }

  console.log(
    `[prepare-cli-sidecar] building yole-cli profile=${profile} target=${target}`,
  );
  const cargo = spawnSync("cargo", cargoArgs, { stdio: "inherit" });
  if (cargo.status !== 0) {
    cleanupPlaceholder();
    process.exit(cargo.status ?? 1);
  }

  const source = join(repoRoot, "core", "target", target, profile, `yole${binExt}`);
  if (!existsSync(source)) {
    console.error(`[prepare-cli-sidecar] missing built CLI: ${source}`);
    cleanupPlaceholder();
    process.exit(1);
  }

  mkdirSync(destDir, { recursive: true });
  copyFileSync(source, dest);
  try {
    chmodSync(dest, 0o755);
  } catch {
    // Best-effort on Windows.
  }
  placeholderCreated = false;
  console.log(`[prepare-cli-sidecar] sidecar ready: ${dest}`);
} catch (error) {
  cleanupPlaceholder();
  throw error;
}
