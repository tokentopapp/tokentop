import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");
const npmCache = resolve(repoRoot, ".package-test-cache");

test("published package includes tsconfig.json for Bun path aliases", () => {
  const result = spawnSync(
    process.platform === "win32" ? "cmd.exe" : "npm",
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm.cmd pack --dry-run --json"]
      : ["pack", "--dry-run", "--json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: npmCache },
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    },
  );

  try {
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const packages = JSON.parse(result.stdout ?? "[]");
    const files = packages[0]?.files ?? [];
    expect(files.some(({ path }: { path: string }) => path === "tsconfig.json")).toBe(true);
  } finally {
    rmSync(npmCache, { recursive: true, force: true });
  }
});
