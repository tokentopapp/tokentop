#!/usr/bin/env bun
/**
 * tokentop analytics — pull install/traffic data from GitHub APIs
 *
 * Usage:  bun .opencode/skills/analytics/scripts/analytics.ts
 *
 * Requires `gh` CLI authenticated with a token that has repo traffic permissions.
 */

// ── constants ──────────────────────────────────────────────────────────

const OWNER = "tokentopapp";
const MAIN_REPO = "tokentop";
const HOMEBREW_REPO = "homebrew-tap";
const SCOOP_REPO = "scoop-tokentop";

// ── colors / formatting ────────────────────────────────────────────────

const c = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	cyan: "\x1b[36m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	magenta: "\x1b[35m",
	blue: "\x1b[34m",
	red: "\x1b[31m",
	white: "\x1b[37m",
	gray: "\x1b[90m",
};

function bar(value: number, max: number, width = 30): string {
	const filled = max > 0 ? Math.round((value / max) * width) : 0;
	return `${c.cyan}${"█".repeat(filled)}${c.dim}${"░".repeat(width - filled)}${c.reset}`;
}

function rpad(s: string, len: number): string {
	return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}

function lpad(s: string, len: number): string {
	return s.length >= len ? s.slice(0, len) : " ".repeat(len - s.length) + s;
}

function fmtDate(iso: string): string {
	return iso.slice(0, 10);
}

function section(title: string): void {
	console.log();
	console.log(`${c.bold}${c.cyan}  ${title}${c.reset}`);
	console.log(`${c.dim}  ${"─".repeat(title.length + 2)}${c.reset}`);
}

function kv(key: string, value: string | number, indent = 4): void {
	console.log(
		`${" ".repeat(indent)}${c.dim}${rpad(key, 22)}${c.reset} ${c.bold}${value}${c.reset}`,
	);
}

// ── GitHub API ─────────────────────────────────────────────────────────

let _token: string | null = null;

async function ghToken(): Promise<string> {
	if (_token) return _token;
	const proc = Bun.spawn(["gh", "auth", "token"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const text = await new Response(proc.stdout).text();
	const code = await proc.exited;
	if (code !== 0 || !text.trim()) {
		console.error(
			`${c.red}  Error: gh CLI not authenticated. Run 'gh auth login' first.${c.reset}`,
		);
		process.exit(1);
	}
	_token = text.trim();
	return _token;
}

async function ghApi<T>(path: string): Promise<T> {
	const token = await ghToken();
	const resp = await fetch(`https://api.github.com${path}`, {
		headers: {
			Authorization: `token ${token}`,
			Accept: "application/vnd.github+json",
		},
	});
	if (!resp.ok) {
		throw new Error(`GitHub API ${path}: ${resp.status} ${resp.statusText}`);
	}
	return resp.json() as Promise<T>;
}

// ── types ──────────────────────────────────────────────────────────────

interface Repo {
	stargazers_count: number;
	forks_count: number;
	subscribers_count: number;
	open_issues_count: number;
	created_at: string;
}

interface Release {
	tag_name: string;
	published_at: string;
	assets: { name: string; download_count: number }[];
}

interface CloneData {
	count: number;
	uniques: number;
	clones: { timestamp: string; count: number; uniques: number }[];
}

interface ViewData {
	count: number;
	uniques: number;
	views: { timestamp: string; count: number; uniques: number }[];
}

interface Referrer {
	referrer: string;
	count: number;
	uniques: number;
}

interface PopularPath {
	path: string;
	count: number;
	uniques: number;
}

// ── data fetching (all parallel) ───────────────────────────────────────

async function fetchAll() {
	const [
		repo,
		releases,
		repoViews,
		repoClones,
		referrers,
		paths,
		brewClones,
		scoopClones,
	] = await Promise.all([
		ghApi<Repo>(`/repos/${OWNER}/${MAIN_REPO}`),
		ghApi<Release[]>(`/repos/${OWNER}/${MAIN_REPO}/releases`),
		ghApi<ViewData>(`/repos/${OWNER}/${MAIN_REPO}/traffic/views`),
		ghApi<CloneData>(`/repos/${OWNER}/${MAIN_REPO}/traffic/clones`),
		ghApi<Referrer[]>(
			`/repos/${OWNER}/${MAIN_REPO}/traffic/popular/referrers`,
		),
		ghApi<PopularPath[]>(
			`/repos/${OWNER}/${MAIN_REPO}/traffic/popular/paths`,
		),
		ghApi<CloneData>(`/repos/${OWNER}/${HOMEBREW_REPO}/traffic/clones`).catch(
			() => null,
		),
		ghApi<CloneData>(`/repos/${OWNER}/${SCOOP_REPO}/traffic/clones`).catch(
			() => null,
		),
	]);
	return {
		repo,
		releases,
		repoViews,
		repoClones,
		referrers,
		paths,
		brewClones,
		scoopClones,
	};
}

// ── rendering ──────────────────────────────────────────────────────────

function renderHeader() {
	console.log();
	console.log(
		`${c.bold}${c.cyan}  ╔══════════════════════════════════════════════════════════╗${c.reset}`,
	);
	console.log(
		`${c.bold}${c.cyan}  ║            tokentop install analytics                    ║${c.reset}`,
	);
	console.log(
		`${c.bold}${c.cyan}  ╚══════════════════════════════════════════════════════════╝${c.reset}`,
	);
}

function renderRepo(repo: Repo, releases: Release[]) {
	const latest = releases[0];
	section("Repository Overview");
	console.log(
		`    ${c.yellow}★ ${repo.stargazers_count}${c.reset}  ·  ` +
			`${c.dim}Forks:${c.reset} ${repo.forks_count}  ·  ` +
			`${c.dim}Watchers:${c.reset} ${repo.subscribers_count}  ·  ` +
			`${c.dim}Issues:${c.reset} ${repo.open_issues_count}  ·  ` +
			`${c.dim}Latest:${c.reset} ${c.green}${latest?.tag_name ?? "none"}${c.reset}`,
	);

	// homebrew core thresholds
	console.log();
	console.log(`    ${c.dim}Homebrew Core Thresholds:${c.reset}`);
	const starPct = Math.min(
		100,
		Math.round((repo.stargazers_count / 75) * 100),
	);
	const forkPct = Math.min(100, Math.round((repo.forks_count / 30) * 100));
	const watchPct = Math.min(
		100,
		Math.round((repo.subscribers_count / 30) * 100),
	);
	const starOk = repo.stargazers_count >= 75;
	const forkOk = repo.forks_count >= 30;
	const watchOk = repo.subscribers_count >= 30;
	const icon = (ok: boolean) => (ok ? `${c.green}✓` : `${c.red}✗`);

	console.log(
		`      ${icon(starOk)} Stars    ${lpad(String(repo.stargazers_count), 4)} / 75   ${bar(repo.stargazers_count, 75, 20)} ${c.dim}${starPct}%${c.reset}`,
	);
	console.log(
		`      ${icon(forkOk)} Forks    ${lpad(String(repo.forks_count), 4)} / 30   ${bar(repo.forks_count, 30, 20)} ${c.dim}${forkPct}%${c.reset}`,
	);
	console.log(
		`      ${icon(watchOk)} Watchers ${lpad(String(repo.subscribers_count), 4)} / 30   ${bar(repo.subscribers_count, 30, 20)} ${c.dim}${watchPct}%${c.reset}`,
	);
	if (starOk || forkOk || watchOk) {
		console.log(
			`      ${c.green}${c.bold}Eligible for homebrew-core submission!${c.reset}`,
		);
	} else {
		console.log(
			`      ${c.dim}Need at least one threshold met for homebrew-core${c.reset}`,
		);
	}
}

function renderTraffic(views: ViewData, clones: CloneData) {
	section("Repo Traffic (14-day rolling window)");
	console.log(
		`    ${c.dim}Views:${c.reset}  ${c.bold}${views.count}${c.reset} total  ${c.dim}(${views.uniques} unique visitors)${c.reset}`,
	);
	console.log(
		`    ${c.dim}Clones:${c.reset} ${c.bold}${clones.count}${c.reset} total  ${c.dim}(${clones.uniques} unique cloners)${c.reset}`,
	);
}

function renderReferrers(referrers: Referrer[]) {
	if (referrers.length === 0) return;
	section("Top Referrers");
	const max = Math.max(...referrers.map((r) => r.count));
	for (const r of referrers.slice(0, 10)) {
		console.log(
			`    ${rpad(r.referrer, 24)} ${lpad(String(r.count), 4)} views  ${c.dim}(${r.uniques} unique)${c.reset}  ${bar(r.count, max, 15)}`,
		);
	}
}

function renderPopularPaths(paths: PopularPath[]) {
	if (paths.length === 0) return;
	section("Popular Pages");
	const max = Math.max(...paths.map((p) => p.count));
	for (const p of paths.slice(0, 8)) {
		const short = p.path.replace(`/${OWNER}/${MAIN_REPO}`, "");
		console.log(
			`    ${rpad(short || "/", 40)} ${lpad(String(p.count), 4)} views  ${c.dim}(${p.uniques} unique)${c.reset}  ${bar(p.count, max, 12)}`,
		);
	}
}

/** Sum all-time release downloads for assets matching any of the given substrings. */
function sumReleaseDl(releases: Release[], patterns: string[]): number {
	let total = 0;
	for (const rel of releases) {
		for (const a of rel.assets) {
			if (patterns.some((p) => a.name.includes(p))) {
				total += a.download_count;
			}
		}
	}
	return total;
}

function renderPackageManagers(
	brewClones: CloneData | null,
	scoopClones: CloneData | null,
	releases: Release[],
) {
	section("Package Manager Installs (14-day rolling window)");

	const brewUniques = brewClones?.uniques ?? 0;
	const scoopUniques = scoopClones?.uniques ?? 0;
	const total = brewUniques + scoopUniques;
	const monthlyEst = Math.round(total * (30 / 14));

	console.log(
		`    ${c.dim}Homebrew ${c.reset}${c.dim}(macOS/Linux)${c.reset}  ${c.bold}${brewUniques}${c.reset} unique`,
	);
	console.log(
		`    ${c.dim}Scoop    ${c.reset}${c.dim}(Windows)${c.reset}     ${c.bold}${scoopUniques}${c.reset} unique  ${c.dim}(upper bound ⚠)${c.reset}`,
	);
	console.log(
		`    ${c.dim}Total${c.reset}                  ${c.bold}${c.green}${total}${c.reset} unique  ${c.dim}(~${monthlyEst}/mo est.)${c.reset}`,
	);

	// daily breakdown chart
	const allDates = new Map<string, { brew: number; scoop: number }>();

	for (const entry of brewClones?.clones ?? []) {
		const d = fmtDate(entry.timestamp);
		const existing = allDates.get(d) ?? { brew: 0, scoop: 0 };
		existing.brew = entry.uniques;
		allDates.set(d, existing);
	}
	for (const entry of scoopClones?.clones ?? []) {
		const d = fmtDate(entry.timestamp);
		const existing = allDates.get(d) ?? { brew: 0, scoop: 0 };
		existing.scoop = entry.uniques;
		allDates.set(d, existing);
	}

	if (allDates.size > 0) {
		console.log();
		console.log(
			`    ${c.dim}Date          Homebrew  Scoop    Total${c.reset}`,
		);
		const sorted = [...allDates.entries()].sort((a, b) =>
			a[0].localeCompare(b[0]),
		);
		const maxTotal = Math.max(...sorted.map(([, v]) => v.brew + v.scoop));
		for (const [date, v] of sorted) {
			const t = v.brew + v.scoop;
			console.log(
				`    ${c.dim}${date}${c.reset}    ${c.blue}${lpad(String(v.brew), 4)}${c.reset}      ${c.magenta}${lpad(String(v.scoop), 4)}${c.reset}     ${lpad(String(t), 4)}  ${bar(t, maxTotal, 20)}`,
			);
		}
	}

	// cross-reference: cloners vs actual binary downloads
	const brewPlatformDl = sumReleaseDl(releases, ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"]);
	const scoopPlatformDl = sumReleaseDl(releases, ["windows"]);
	const brewPct = brewUniques > 0 ? Math.round((brewPlatformDl / brewUniques) * 100) : 0;
	const scoopPct = scoopUniques > 0 ? Math.round((scoopPlatformDl / scoopUniques) * 100) : 0;

	console.log();
	console.log(`    ${c.dim}Cloners vs release downloads (sanity check):${c.reset}`);
	console.log(
		`      ${c.dim}Homebrew${c.reset}  ${lpad(String(brewUniques), 4)} cloners → ${lpad(String(brewPlatformDl), 4)} binary dl  ${c.dim}(${brewPct}% conversion)${c.reset}`,
	);
	console.log(
		`      ${c.dim}Scoop${c.reset}     ${lpad(String(scoopUniques), 4)} cloners → ${lpad(String(scoopPlatformDl), 4)} binary dl  ${c.dim}(${scoopPct}% conversion)${c.reset}`,
	);
	console.log(
		`      ${c.dim}Low conversion suggests bot/crawler inflation in clone counts.${c.reset}`,
	);
	}

function renderReleases(releases: Release[]) {
	section("GitHub Release Downloads");

	let totalAll = 0;
	const platformTotals: Record<string, number> = {};

	for (const rel of releases) {
		const assets = rel.assets.filter((a) => a.name !== "SHA256SUMS");
		if (assets.length === 0) continue;

		const relTotal = assets.reduce((s, a) => s + a.download_count, 0);
		totalAll += relTotal;
		const max = Math.max(...assets.map((a) => a.download_count));

		console.log(
			`\n    ${c.bold}${rel.tag_name}${c.reset}  ${c.dim}(${fmtDate(rel.published_at)})${c.reset}  ${c.dim}total: ${relTotal}${c.reset}`,
		);

		for (const a of assets.sort(
			(x, y) => y.download_count - x.download_count,
		)) {
			const platform = parsePlatform(a.name);
			platformTotals[platform] =
				(platformTotals[platform] ?? 0) + a.download_count;
			console.log(
				`      ${rpad(a.name, 28)} ${lpad(String(a.download_count), 4)}  ${bar(a.download_count, max, 18)}`,
			);
		}
	}

	// totals
	if (Object.keys(platformTotals).length > 0) {
		console.log();
		console.log(`    ${c.bold}All-Time by Platform${c.reset}`);
		const max = Math.max(...Object.values(platformTotals));
		const sorted = Object.entries(platformTotals).sort(
			(a, b) => b[1] - a[1],
		);
		for (const [platform, count] of sorted) {
			console.log(
				`      ${rpad(platform, 20)} ${lpad(String(count), 4)}  ${bar(count, max, 20)}`,
			);
		}
		console.log(`      ${c.dim}${"─".repeat(48)}${c.reset}`);
		console.log(
			`      ${rpad("Total", 20)} ${c.bold}${lpad(String(totalAll), 4)}${c.reset}`,
		);
	}
}

function parsePlatform(name: string): string {
	if (name.includes("darwin-arm64")) return "macOS (Apple Silicon)";
	if (name.includes("darwin-x64")) return "macOS (Intel)";
	if (name.includes("linux-arm64")) return "Linux (ARM64)";
	if (name.includes("linux-x64")) return "Linux (x64)";
	if (name.includes("windows")) return "Windows (x64)";
	return name;
}

// ── npm download stats ─────────────────────────────────────────────────

interface NpmDownloads {
	downloads: number;
	start: string;
	end: string;
	package: string;
}

interface NpmDailyDownloads {
	downloads: { downloads: number; day: string }[];
	start: string;
	end: string;
	package: string;
}

interface NpmVersionDownloads {
	package: string;
	downloads: Record<string, number>;
}

interface NpmRegistryMeta {
	time: Record<string, string>;
}

async function fetchNpmStats() {
	const pkg = "@tokentop/ttop";
	const encoded = encodeURIComponent(pkg);

	// get first-publish date from registry metadata
	const meta = await fetch(`https://registry.npmjs.org/${encoded}`)
		.then((r) => (r.ok ? (r.json() as Promise<NpmRegistryMeta>) : null))
		.catch(() => null);
	const created = meta?.time?.created?.slice(0, 10) ?? null;

	const today = new Date().toISOString().slice(0, 10);

	const [lastWeek, lastMonth, daily, allTime, perVersion] = await Promise.all([
		fetch(
			`https://api.npmjs.org/downloads/point/last-week/${encoded}`,
		).then((r) => (r.ok ? (r.json() as Promise<NpmDownloads>) : null)),
		fetch(
			`https://api.npmjs.org/downloads/point/last-month/${encoded}`,
		).then((r) => (r.ok ? (r.json() as Promise<NpmDownloads>) : null)),
		fetch(
			`https://api.npmjs.org/downloads/range/last-month/${encoded}`,
		).then((r) => (r.ok ? (r.json() as Promise<NpmDailyDownloads>) : null)),
		created
			? fetch(
					`https://api.npmjs.org/downloads/range/${created}:${today}/${encoded}`,
				).then((r) => (r.ok ? (r.json() as Promise<NpmDailyDownloads>) : null))
			: Promise.resolve(null),
		fetch(
			`https://api.npmjs.org/versions/${encoded}/last-week`,
		).then((r) => (r.ok ? (r.json() as Promise<NpmVersionDownloads>) : null)),
	]);

	const allTimeTotal = allTime
		? allTime.downloads.reduce((s, d) => s + d.downloads, 0)
		: null;

	return { lastWeek, lastMonth, daily, allTimeTotal, perVersion, created };
}

function renderNpm(npm: {
	lastWeek: NpmDownloads | null;
	lastMonth: NpmDownloads | null;
	daily: NpmDailyDownloads | null;
	allTimeTotal: number | null;
	perVersion: NpmVersionDownloads | null;
	created: string | null;
}) {
	section("npm Downloads (@tokentop/ttop)");

	if (!npm.lastWeek && !npm.lastMonth) {
		console.log(`    ${c.dim}No npm download data available${c.reset}`);
		return;
	}

	if (npm.allTimeTotal != null) {
		console.log(
			`    ${c.dim}All-time:${c.reset}      ${c.bold}${npm.allTimeTotal}${c.reset}  ${c.dim}(since ${npm.created ?? "first publish"})${c.reset}`,
		);
	}
	if (npm.lastMonth) {
		console.log(
			`    ${c.dim}Last 30 days:${c.reset}  ${c.bold}${npm.lastMonth.downloads}${c.reset}`,
		);
	}
	if (npm.lastWeek) {
		console.log(
			`    ${c.dim}Last 7 days:${c.reset}   ${c.bold}${npm.lastWeek.downloads}${c.reset}`,
		);
	}

	// per-version breakdown (last 7 days)
	if (npm.perVersion?.downloads) {
		const versions = Object.entries(npm.perVersion.downloads)
			.sort((a, b) => b[1] - a[1]);
		if (versions.length > 0) {
			const max = versions[0][1];
			console.log();
			console.log(`    ${c.dim}By version (last 7 days):${c.reset}`);
			for (const [ver, count] of versions) {
				console.log(
					`    ${c.dim}${rpad(ver, 12)}${c.reset}  ${lpad(String(count), 4)}  ${bar(count, max, 20)}`,
				);
			}
		}
	}

	// daily chart for last 14 days
	if (npm.daily?.downloads) {
		const recent = npm.daily.downloads.slice(-14);
		if (recent.length > 0) {
			const max = Math.max(...recent.map((d) => d.downloads));
			console.log();
			console.log(`    ${c.dim}Daily (last 14 days):${c.reset}`);
			for (const d of recent) {
				console.log(
					`    ${c.dim}${d.day}${c.reset}  ${lpad(String(d.downloads), 4)}  ${bar(d.downloads, max, 20)}`,
				);
			}
		}
	}
}

// ── main ───────────────────────────────────────────────────────────────

async function main() {
	console.log(`\n${c.dim}  Fetching data from GitHub + npm...${c.reset}`);

	try {
		const [data, npm] = await Promise.all([fetchAll(), fetchNpmStats()]);

		// clear the "fetching" line
		process.stdout.write("\x1b[1A\x1b[2K");

		renderHeader();
		renderRepo(data.repo, data.releases);
		renderTraffic(data.repoViews, data.repoClones);
		renderReferrers(data.referrers);
		renderPopularPaths(data.paths);
		renderPackageManagers(data.brewClones, data.scoopClones, data.releases);
		renderNpm(npm);
		renderReleases(data.releases);

		console.log();
		console.log(
			`${c.dim}  GitHub traffic data is a 14-day rolling window. Repo stats and release downloads are all-time.${c.reset}`,
		);
		console.log(
			`${c.dim}  npm data from registry.npmjs.org. Homebrew/Scoop installs approximated from git clone${c.reset}`,
		);
		console.log(
			`${c.dim}  counts (excludes fetch/pull). Scoop numbers may include bot/crawler traffic.${c.reset}`,
		);
		console.log();
	} catch (err) {
		console.error(
			`\n${c.red}  Error: ${err instanceof Error ? err.message : err}${c.reset}`,
		);
		console.error(
			`${c.dim}  Make sure 'gh' is installed and authenticated with repo access.${c.reset}`,
		);
		process.exit(1);
	}
}

main();
