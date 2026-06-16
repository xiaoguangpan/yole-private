#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, chmodSync, readFileSync } from "node:fs";
import { get } from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE = "v1.0.113";
const ASSETS = {
  "win32-x64": {
    name: "officecli-win-x64.exe",
    sha256: "15d29f3a04e6ad00503de178f98dae872b47ef71f09fac3c614212b209c4d229",
    dest: "officecli.exe",
  },
  "win32-arm64": {
    name: "officecli-win-arm64.exe",
    sha256: "94fa5101b94f2fe59c1458688bbc3ddcde4f244afe204143b7eac9bb5089f784",
    dest: "officecli.exe",
  },
  "darwin-arm64": {
    name: "officecli-mac-arm64",
    sha256: "35a733b598cb32a57d4edc1217a5edfcf63aa9c141916b0b4ef54aa37e4c30ba",
    dest: "officecli",
  },
  "darwin-x64": {
    name: "officecli-mac-x64",
    sha256: "62ad1b63ec1b833efe01a51d3564238ce274b51a785b1a2fc91880c66381b0d2",
    dest: "officecli",
  },
  "linux-x64": {
    name: "officecli-linux-x64",
    sha256: "ffe09f5f8ec76240e44ff431b802b8a4466775afda328f1f7b606e3a79807311",
    dest: "officecli",
  },
  "linux-arm64": {
    name: "officecli-linux-arm64",
    sha256: "893874471e6830d29580ba9cab0a5834eab80278092f77edb31292bffff1f9fd",
    dest: "officecli",
  },
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptDir);
const platformKey = `${process.platform}-${process.arch}`;
const asset = ASSETS[platformKey];

if (!asset) {
  console.error(`[prepare-officecli] unsupported platform: ${platformKey}`);
  process.exit(1);
}

const destDir = join(repoRoot, "core", "officecli");
const dest = join(destDir, asset.dest);
const url = `https://github.com/iOfficeAI/OfficeCLI/releases/download/${RELEASE}/${asset.name}`;

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

if (existsSync(dest) && sha256(dest) === asset.sha256) {
  console.log(`[prepare-officecli] ready: ${dest}`);
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
const tmp = `${dest}.download`;
rmSync(tmp, { force: true });

console.log(`[prepare-officecli] downloading ${asset.name}`);
await download(url, tmp);
const digest = sha256(tmp);
if (digest !== asset.sha256) {
  rmSync(tmp, { force: true });
  console.error(`[prepare-officecli] sha256 mismatch: expected ${asset.sha256}, got ${digest}`);
  process.exit(1);
}
renameSync(tmp, dest);
try {
  chmodSync(dest, 0o755);
} catch {
  // Best-effort on Windows.
}
console.log(`[prepare-officecli] ready: ${dest}`);
process.exit(0);

function download(downloadUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const request = get(downloadUrl, { headers: { "User-Agent": "Yole-build" } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(response.headers.location, outputPath).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const file = createWriteStream(outputPath);
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    });
    request.on("error", reject);
  });
}
