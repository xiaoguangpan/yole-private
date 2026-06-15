#!/usr/bin/env node

import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const tauriConfigPath = path.join(repoRoot, "core", "tauri.conf.json");
const appVersion = readTauriVersion();
const defaultNsi = path.join(repoRoot, "core", "target", "release", "nsis", "x64", "installer.nsi");

const args = parseArgs(process.argv.slice(2));
const sourceNsi = path.resolve(args.source || defaultNsi);
const outputExe = path.resolve(
  args.out ||
    path.join(
      repoRoot,
      "core",
      "target",
      "release",
      "bundle",
      "nsis",
      `Yole_${appVersion}_default-passive_x64-setup.exe`,
    ),
);

const makensis = resolveMakensis();
const nsiDir = path.dirname(sourceNsi);
const tempNsi = path.join(nsiDir, `installer.default-passive.${Date.now()}.nsi`);

try {
  if (!fs.existsSync(sourceNsi)) {
    throw new Error(`NSIS script not found: ${sourceNsi}. Run pnpm build first.`);
  }
  fs.mkdirSync(path.dirname(outputExe), { recursive: true });
  const source = fs.readFileSync(sourceNsi, "utf8");
  const patched = patchInstaller(source, outputExe);
  fs.writeFileSync(tempNsi, patched, "utf8");

  const result = childProcess.spawnSync(makensis, [tempNsi], {
    cwd: nsiDir,
    encoding: "utf8",
    stdio: "pipe",
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0) {
    throw new Error(`makensis failed with exit code ${result.status}`);
  }
  if (!fs.existsSync(outputExe)) {
    throw new Error(`makensis completed but output was not created: ${outputExe}`);
  }
  console.log(`[default-passive-nsis] wrote ${outputExe}`);
} finally {
  fs.rmSync(tempNsi, { force: true });
}

function parseArgs(raw) {
  const parsed = {};
  for (let i = 0; i < raw.length; i += 1) {
    const arg = raw[i];
    if (arg === "--source") parsed.source = raw[++i];
    else if (arg === "--out") parsed.out = raw[++i];
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/rebuild-nsis-default-passive.mjs [--source installer.nsi] [--out setup.exe]");
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function readTauriVersion() {
  const raw = fs.readFileSync(tauriConfigPath, "utf8");
  const config = JSON.parse(raw);
  const version = String(config.version || "").trim();
  if (!version) {
    throw new Error(`missing version in ${tauriConfigPath}`);
  }
  return version;
}

function patchInstaller(source, output) {
  const outputPath = output.replaceAll("\\", "\\\\");
  const withOutput = source.replace(
    /^!define OUTFILE ".*"$/m,
    `!define OUTFILE "${outputPath}"`,
  );
  if (withOutput === source) {
    throw new Error("could not find OUTFILE define in generated NSIS script");
  }

  const needle =
    /Function \.onInit\r?\n  \${GetOptions} \$CMDLINE "\/P" \$PassiveMode\r?\n  \${IfNot} \${Errors}\r?\n    StrCpy \$PassiveMode 1\r?\n  \${EndIf}/;
  const replacement = [
    "Function .onInit",
    '  ${GetOptions} $CMDLINE "/P" $PassiveMode',
    "  ${IfNot} ${Errors}",
    "    StrCpy $PassiveMode 1",
    "  ${EndIf}",
    "",
    "  ; Yole default installer mode: show progress, skip choices.",
    '  ; Use /FULLUI to keep the full Tauri installer wizard and path picker.',
    '  ${GetOptions} $CMDLINE "/FULLUI" $0',
    "  ${If} ${Errors}",
    "    StrCpy $PassiveMode 1",
    "  ${Else}",
    "    StrCpy $PassiveMode 0",
    "  ${EndIf}",
  ].join("\n");
  const patched = withOutput.replace(needle, replacement);
  if (patched === withOutput) {
    throw new Error("could not patch installer .onInit passive-mode defaults");
  }
  return patched;
}

function resolveMakensis() {
  const candidates = [
    process.env.MAKENSIS_PATH,
    path.join(os.homedir(), "AppData", "Local", "tauri", "NSIS", "makensis.exe"),
    path.join(os.homedir(), "AppData", "Local", "tauri", "NSIS", "Bin", "makensis.exe"),
    "makensis",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate === "makensis") return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("makensis.exe not found. Build once with Tauri so it installs NSIS.");
}
