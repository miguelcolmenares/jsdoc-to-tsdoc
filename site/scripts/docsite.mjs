// Runs the docsite CLI at the version this site pins in `.docsite.json`, so the CLI is an external
// tool and not a dependency of the site. `docsite upgrade` moves the pin and refreshes this file.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lockFile = path.join(siteDir, ".docsite.json");
const cli = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, "utf-8")).cli : undefined;
if (!cli?.version) {
  console.error("No CLI version pinned in .docsite.json. Run `npx @silverassist/docsite upgrade`.");
  process.exit(1);
}

const windows = process.platform === "win32";
const local = path.join(siteDir, "node_modules/.bin", windows ? "docsite.cmd" : "docsite");
const [command, args] =
  cli.mode === "dependency" && existsSync(local)
    ? [local, process.argv.slice(2)]
    : ["npx", ["--yes", `@silverassist/docsite@${cli.version}`, ...process.argv.slice(2)]];

// `npx` and the `.cmd` shim are batch files on Windows, which need a shell to run.
const result = spawnSync(command, args, { stdio: "inherit", shell: windows });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
