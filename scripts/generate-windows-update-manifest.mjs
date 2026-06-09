#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

const artifact = requiredArg(args, "artifact");
const signature = requiredArg(args, "signature");
const version = requiredArg(args, "version");
const url = requiredArg(args, "url");
const outPath = args.out ?? "latest.json";
const pubDate = args["pub-date"] ?? new Date().toISOString();
const notes = args.notes ?? "https://github.com/xiaoguangpan/yole/releases";

if (!url.startsWith("https://")) {
  throw new Error("--url must be an HTTPS URL");
}

const artifactName = path.basename(artifact);
if (!fs.existsSync(artifact)) {
  throw new Error(`Missing artifact: ${artifact}`);
}
if (!fs.existsSync(signature)) {
  throw new Error(`Missing signature: ${signature}`);
}
if (!/^Yole_.+_x64-setup\.exe$/.test(artifactName)) {
  throw new Error(`Unexpected Windows setup filename: ${artifactName}`);
}

const manifest = {
  version,
  notes,
  pub_date: pubDate,
  platforms: {
    "windows-x86_64": {
      signature: fs.readFileSync(signature, "utf8").trim(),
      url,
    },
  },
};

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outPath}`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function requiredArg(parsed, key) {
  const value = parsed[key];
  if (!value) {
    printUsage();
    throw new Error(`Missing required --${key}`);
  }
  return value;
}

function printUsage() {
  console.log(`Usage:
  node scripts/generate-windows-update-manifest.mjs \\
    --artifact Yole_0.0.1_x64-setup.exe \\
    --signature Yole_0.0.1_x64-setup.exe.sig \\
    --version 0.0.1 \\
    --url https://na.itxgp.com/yole-updates/stable/Yole_0.0.1_x64-setup.exe \\
    --out latest.json

Options:
  --pub-date <iso-date>       Defaults to the current time.
  --notes <url-or-text>       Defaults to the public Yole Releases page.
`);
}
