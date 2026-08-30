#!/usr/bin/env npx tsx
/**
 * Agent-Docs Mesh shim — forwards to the canonical kit in tank-royale-wiki.
 * Override: WIKI_ROOT=/path/to/tank-royale-wiki
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const wikiRoot =
  process.env.WIKI_ROOT ??
  join(homedir(), "Documents/GitHub/tank-royale-wiki");
const kit = join(wikiRoot, "scripts/agent-docs/index.ts");
const tsxLoader = join(wikiRoot, "node_modules/tsx/dist/loader.mjs");

if (!existsSync(kit) || !existsSync(tsxLoader)) {
  console.error(
    `agent-docs: canonical kit runtime is unavailable under ${wikiRoot}. ` +
      `Set WIKI_ROOT or vendor scripts/agent-docs/.`,
  );
  process.exit(2);
}

const r = spawnSync(
  process.execPath,
  ["--import", tsxLoader, kit, ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(r.status ?? 1);
