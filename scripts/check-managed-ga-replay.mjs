#!/usr/bin/env node

import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const managedRoot = path.join(repoRoot, "managed-ga");
const manifestPath = path.join(managedRoot, "manifest.json");
const patchRoot = path.join(managedRoot, "patches");
const actualCodeRoot = path.join(managedRoot, "code");

const sourceArg =
  process.argv[2] ||
  process.env.GENERIC_AGENT_PATH ||
  process.env.GA_SOURCE ||
  path.join(os.homedir(), "Documents", "GenericAgent");
const sourceRoot = path.resolve(expandHome(sourceArg));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yole-managed-ga-replay-"));

const textExtensions = new Set([
  ".py",
  ".js",
  ".json",
  ".md",
  ".txt",
  ".html",
  ".css",
  ".toml",
  ".cmd",
  ".sh",
  ".yml",
  ".yaml",
]);
const excludedDirs = new Set([
  ".git",
  ".DS_Store",
  ".venv",
  "venv",
  "__pycache__",
  "memory",
  "sop",
  "skills",
  "temp",
  "model_responses",
]);
const excludedFiles = new Set([".DS_Store", "mykey.py", "mykey.json"]);

let keepTemp = Boolean(process.env.YOLE_KEEP_MANAGED_GA_REPLAY);

try {
  main();
  if (!keepTemp) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
} catch (error) {
  keepTemp = true;
  console.error(`[managed-ga-replay] ${error.message}`);
  console.error(`[managed-ga-replay] kept temp dir: ${tempRoot}`);
  process.exit(1);
}

function main() {
  const manifest = readJson(manifestPath);
  const expectedCommit = manifest?.upstream?.commit;
  const patches = manifest?.patchStack?.patches;
  if (!expectedCommit || !Array.isArray(patches) || patches.length === 0) {
    throw new Error("managed-ga/manifest.json must pin upstream.commit and list patches");
  }
  if (!fs.existsSync(path.join(sourceRoot, ".git"))) {
    throw new Error(
      `GenericAgent source checkout not found: ${sourceRoot}\n` +
        "Pass one as an argument or set GENERIC_AGENT_PATH.",
    );
  }
  const actualCommit = git(["rev-parse", "HEAD"], sourceRoot).stdout.trim();
  if (actualCommit !== expectedCommit) {
    throw new Error(
      `GenericAgent baseline mismatch: expected ${expectedCommit}, got ${actualCommit}`,
    );
  }
  const sourceStatus = git(["status", "--porcelain"], sourceRoot).stdout.trim();
  if (sourceStatus) {
    throw new Error(`GenericAgent source checkout must be clean:\n${sourceStatus}`);
  }

  const replayRoot = path.join(tempRoot, "replay");
  const replayCodeRoot = path.join(replayRoot, "managed-ga", "code");
  fs.mkdirSync(replayCodeRoot, { recursive: true });
  copyTree(sourceRoot, replayCodeRoot);
  normalizeTextTree(replayCodeRoot);

  for (const patchName of patches) {
    if (
      typeof patchName !== "string" ||
      patchName.includes("/") ||
      patchName.includes("\\") ||
      patchName.includes("..")
    ) {
      throw new Error(`invalid patch name in managed-ga/manifest.json: ${patchName}`);
    }
    const patchPath = path.join(patchRoot, patchName);
    if (!fs.existsSync(patchPath)) {
      throw new Error(`missing managed GA patch: ${path.relative(repoRoot, patchPath)}`);
    }
    const result = spawnGit(
      ["apply", "--verbose", "--whitespace=nowarn", "--directory=managed-ga/code", patchPath],
      replayRoot,
    );
    const output = `${result.stdout}\n${result.stderr}`;
    if (result.status !== 0) {
      throw new Error(`failed to apply ${patchName}:\n${output.trim()}`);
    }
    if (/Skipped patch/.test(output)) {
      throw new Error(`git skipped at least one hunk in ${patchName}:\n${output.trim()}`);
    }
  }
  normalizeTextTree(replayCodeRoot);

  const actualNormalizedRoot = path.join(tempRoot, "actual", "code");
  fs.mkdirSync(actualNormalizedRoot, { recursive: true });
  copyTree(actualCodeRoot, actualNormalizedRoot);
  normalizeTextTree(actualNormalizedRoot);

  const generated = snapshotTree(replayCodeRoot);
  const actual = snapshotTree(actualNormalizedRoot);
  const differences = diffSnapshots(generated, actual);
  if (differences.length > 0) {
    const shown = differences.slice(0, 80).join("\n");
    const suffix = differences.length > 80 ? `\n... ${differences.length - 80} more` : "";
    throw new Error(
      "managed-ga/code does not match upstream + patch stack after normalization:\n" +
        shown +
        suffix,
    );
  }

  console.log("[managed-ga-replay] OK");
}

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function spawnGit(args, cwd) {
  return childProcess.spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CEILING_DIRECTORIES: path.dirname(tempRoot),
    },
  });
}

function git(args, cwd) {
  const result = spawnGit(args, cwd);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

function copyTree(source, dest) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirs.has(entry.name)) continue;
    if (entry.isFile() && (excludedFiles.has(entry.name) || entry.name.endsWith(".pyc"))) continue;
    const sourcePath = path.join(source, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyTree(sourcePath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}

function normalizeTextTree(root) {
  for (const file of walkFiles(root)) {
    if (!isTextFile(file)) continue;
    const bytes = fs.readFileSync(file);
    if (bytes.includes(0)) continue;
    let text = bytes.toString("utf8");
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    text = text.replace(/[ \t]+$/gm, "");
    if (text.length > 0) text = text.replace(/\n+$/g, "") + "\n";
    fs.writeFileSync(file, text, "utf8");
  }
}

function isTextFile(file) {
  const name = path.basename(file);
  return name === "ga" || textExtensions.has(path.extname(name).toLowerCase());
}

function walkFiles(root) {
  const pending = [root];
  const files = [];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!excludedDirs.has(entry.name)) pending.push(entryPath);
      } else if (entry.isFile()) {
        if (!excludedFiles.has(entry.name) && !entry.name.endsWith(".pyc")) files.push(entryPath);
      }
    }
  }
  return files;
}

function snapshotTree(root) {
  const snapshot = new Map();
  for (const file of walkFiles(root)) {
    const rel = path.relative(root, file).replaceAll(path.sep, "/");
    const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    snapshot.set(rel, hash);
  }
  return snapshot;
}

function diffSnapshots(left, right) {
  const keys = new Set([...left.keys(), ...right.keys()]);
  const differences = [];
  for (const key of [...keys].sort()) {
    if (!left.has(key)) differences.push(`extra in managed-ga/code: ${key}`);
    else if (!right.has(key)) differences.push(`missing from managed-ga/code: ${key}`);
    else if (left.get(key) !== right.get(key)) differences.push(`content differs: ${key}`);
  }
  return differences;
}
