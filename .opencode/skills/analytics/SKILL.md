---
name: analytics
description: Pull and display tokentop install analytics from GitHub — release downloads, Homebrew tap installs, Scoop bucket installs, repo traffic, referrers, and homebrew-core eligibility status
license: MIT
allowed-tools:
  - bash
  - read
metadata:
  version: "1.0"
  author: "tokentop"
---

# Tokentop Install Analytics

Run the analytics script to pull all install and traffic data for tokentop from the GitHub API and display it in the terminal.

## Usage

Execute the analytics script from the project root:

```bash
bun .opencode/skills/analytics/scripts/analytics.ts
```

## What It Shows

1. **Repository Overview** — Stars, forks, watchers, open issues, latest release
2. **Homebrew Core Eligibility** — Progress bars toward the 75-star / 30-fork / 30-watcher thresholds
3. **Repo Traffic** — Views and clones for the main repo (14-day rolling window)
4. **Top Referrers** — Where visitors find tokentop (Google, Reddit, Twitter, etc.)
5. **Popular Pages** — Most visited pages on the GitHub repo
6. **Package Manager Installs** — Homebrew tap and Scoop bucket clone counts with daily breakdown chart
7. **GitHub Release Downloads** — Per-release, per-platform download counts with all-time totals

## Requirements

- `gh` CLI installed and authenticated (`gh auth login`)
- Token must have `repo` scope for traffic data access (traffic APIs require push access)

## Notes

- GitHub Traffic API only retains the **last 14 days** of data. There is no way to get historical data beyond that window.
- Homebrew/Scoop install counts are approximated from git clone counts on the tap/bucket repos. Each `brew install tokentopapp/tap/tokentop` or `scoop install tokentop` triggers a clone.
- Release download counts are all-time and cumulative.
