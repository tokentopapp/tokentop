import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const CACHE_DIR = path.join(os.homedir(), '.cache/tokentop');
const PACKAGE_JSON_PATH = path.join(CACHE_DIR, 'package.json');
const NODE_MODULES = path.join(CACHE_DIR, 'node_modules');

interface CachePackageJson {
  name: string;
  private: boolean;
  dependencies: Record<string, string>;
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  try {
    await fs.access(PACKAGE_JSON_PATH);
  } catch {
    const skeleton: CachePackageJson = {
      name: 'tokentop-plugin-cache',
      private: true,
      dependencies: {},
    };
    await fs.writeFile(PACKAGE_JSON_PATH, JSON.stringify(skeleton, null, 2));
  }
}

function parsePackageSpec(spec: string): { name: string; version: string } {
  const atIndex = spec.lastIndexOf('@');
  if (atIndex > 0) {
    return { name: spec.slice(0, atIndex), version: spec.slice(atIndex + 1) };
  }
  return { name: spec, version: 'latest' };
}

async function isInstalled(name: string, version: string): Promise<boolean> {
  try {
    const pkgJsonPath = path.join(NODE_MODULES, name, 'package.json');
    const raw = await fs.readFile(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(raw) as { version?: string };

    if (version === 'latest') {
      return !!pkg.version;
    }
    return pkg.version === version;
  } catch {
    return false;
  }
}

export interface InstallResult {
  name: string;
  version: string;
  installed: boolean;
  error?: string;
  resolvedPath: string;
}

export async function installNpmPlugin(spec: string): Promise<InstallResult> {
  const { name, version } = parsePackageSpec(spec);
  const resolvedPath = path.join(NODE_MODULES, name);

  await ensureCacheDir();

  if (await isInstalled(name, version)) {
    return { name, version, installed: false, resolvedPath };
  }

  const versionArg = version === 'latest' ? name : `${name}@${version}`;

  try {
    const proc = Bun.spawn(
      ['bun', 'add', '--force', '--exact', '--cwd', CACHE_DIR, versionArg],
      { stdout: 'pipe', stderr: 'pipe' },
    );

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return {
        name,
        version,
        installed: false,
        error: `bun add failed (exit ${exitCode}): ${stderr.trim().slice(0, 200)}`,
        resolvedPath,
      };
    }

    return { name, version, installed: true, resolvedPath };
  } catch (err) {
    return {
      name,
      version,
      installed: false,
      error: err instanceof Error ? err.message : String(err),
      resolvedPath,
    };
  }
}

export async function installAllNpmPlugins(
  specs: string[],
): Promise<InstallResult[]> {
  if (specs.length === 0) return [];

  await ensureCacheDir();

  const results: InstallResult[] = [];
  const toInstall: string[] = [];

  for (const spec of specs) {
    const { name, version } = parsePackageSpec(spec);
    const resolvedPath = path.join(NODE_MODULES, name);

    if (await isInstalled(name, version)) {
      results.push({ name, version, installed: false, resolvedPath });
    } else {
      toInstall.push(version === 'latest' ? name : `${name}@${version}`);
      results.push({ name, version, installed: true, resolvedPath });
    }
  }

  if (toInstall.length === 0) return results;

  try {
    const proc = Bun.spawn(
      ['bun', 'add', '--force', '--exact', '--cwd', CACHE_DIR, ...toInstall],
      { stdout: 'pipe', stderr: 'pipe' },
    );

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      const errMsg = `bun add failed (exit ${exitCode}): ${stderr.trim().slice(0, 200)}`;
      for (const r of results) {
        if (r.installed) {
          r.installed = false;
          r.error = errMsg;
        }
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    for (const r of results) {
      if (r.installed) {
        r.installed = false;
        r.error = errMsg;
      }
    }
  }

  return results;
}

export function resolveNpmPluginPath(packageName: string): string {
  const { name } = parsePackageSpec(packageName);
  return path.join(NODE_MODULES, name);
}

export { CACHE_DIR, NODE_MODULES };
