# Tokentop (`ttop`) - AI Token Usage Monitor

## Project Overview

**Tokentop** is a terminal-based real-time token usage and cost monitoring application - "htop for AI API usage." It monitors model providers (Anthropic, OpenAI, etc.) used by coding agents (OpenCode, Claude Code, Cursor) and displays usage limits, costs, and budgets in a beautiful terminal UI.

**This is a public tool** intended for release to the community. Cross-platform support (macOS, Linux, Windows) is important.

## Tech Stack

- **Runtime**: Bun (required for OpenTUI native modules)
- **TUI Framework**: OpenTUI with React reconciler (`@opentui/react`)
- **Language**: TypeScript (strict mode)
- **Package Manager**: Bun

## Architecture Principles

1. **Plugin-Based Architecture**
   - Four plugin types: `provider`, `agent`, `theme`, `notification`
   - Built-in plugins for common use cases
   - npm-based distribution for community plugins (`@tokentop/*`)
   - Permission-based sandboxing for security

2. **OpenCode-First**
   - Primary focus on OpenCode users
   - Reuse OpenCode's existing auth credentials
   - Support for OpenCode's provider ecosystem

3. **Real-Time Focus**
   - API polling for provider usage data
   - Session parsing for token tracking
   - Cost estimation when actual data unavailable

4. **Modular & Extensible**
   - Each component is independently testable
   - New providers/agents can be added via plugins
   - Themes and notifications are pluggable

## Directory Structure

```
src/
├── cli.ts                    # CLI entry point (ttop binary)
├── plugins/
│   ├── types/                # Plugin interface definitions
│   │   ├── base.ts
│   │   ├── provider.ts
│   │   ├── agent.ts
│   │   ├── theme.ts
│   │   ├── notification.ts
│   │   └── index.ts
│   ├── loader.ts             # Plugin discovery & loading
│   ├── registry.ts           # Plugin management
│   ├── sandbox.ts            # Permission enforcement
│   ├── providers/            # Built-in provider plugins
│   ├── agents/               # Built-in agent plugins
│   ├── themes/               # Built-in theme plugins
│   └── notifications/        # Built-in notification plugins
├── pricing/
│   ├── estimator.ts          # Cost estimation engine
│   ├── models-dev.ts         # models.dev integration
│   └── fallback.ts           # Fallback pricing data
├── credentials/
│   ├── index.ts              # Credential discovery
│   ├── opencode.ts           # OpenCode auth reader
│   ├── env.ts                # Environment variables
│   └── external.ts           # External CLI auth files
├── tui/
│   ├── index.tsx             # TUI entry point
│   ├── App.tsx               # Main app component
│   ├── components/           # Reusable UI components
│   ├── views/                # Full-screen views
│   ├── hooks/                # React hooks
│   ├── context/              # React context providers
│   └── config/               # Settings and themes
├── sessions/                 # Coding agent session parsing
└── utils/                    # Utility functions
```

## Plugin System

### Plugin Types

| Type | Purpose | Examples |
|------|---------|----------|
| `provider` | Model provider API integration | Anthropic, OpenAI, Codex |
| `agent` | Coding agent session/auth reading | OpenCode, Claude Code, Cursor |
| `theme` | Visual themes | Dracula, Tokyo Night, Nord |
| `notification` | Alert delivery | Terminal bell, Slack, Discord |

### Plugin Permissions

All plugins must declare their permissions:

```typescript
permissions: {
  network?: { enabled: boolean; allowedDomains?: string[] };
  filesystem?: { read?: boolean; write?: boolean; paths?: string[] };
  env?: { read?: boolean; vars?: string[] };
  system?: { notifications?: boolean; clipboard?: boolean };
}
```

### npm Plugin Naming

- Providers: `@tokentop/provider-<name>`
- Agents: `@tokentop/agent-<name>`
- Themes: `@tokentop/theme-<name>`
- Notifications: `@tokentop/notification-<name>`

## OpenTUI Guidelines

### Critical Rules

1. **Never use `process.exit()`** - Use `renderer.destroy()` instead
2. **Always `await createCliRenderer()`** - Renderer creation is async
3. **JSX intrinsics are not HTML** - Use `<box>`, `<text>`, not `<div>`, `<span>`
4. **Text modifiers inside `<text>`** - `<text><bold>Bold</bold></text>`
5. **Use `focused` prop on inputs** - Required for keyboard input
6. **Configure tsconfig** - Set `jsxImportSource: "@opentui/react"`

### Component Patterns

```tsx
// Correct: OpenTUI components
<box flexDirection="column" padding={1}>
  <text fg="#60a5fa">Hello</text>
  <text><bold>Bold text</bold></text>
</box>

// Wrong: HTML elements
<div style={{ display: 'flex' }}>
  <span style={{ color: 'blue' }}>Hello</span>
</div>
```

## Development Commands

```bash
# Development
bun run dev           # Run with hot reload
bun run build         # Build for production

# Testing
bun test              # Run tests
bun test --watch      # Watch mode

# Linting
bun run lint          # ESLint
bun run typecheck     # TypeScript check
```

## Configuration

User config location: `~/.config/tokentop/config.json`

Key settings:
- `theme`: Active theme ID
- `colorScheme`: `"auto"` | `"light"` | `"dark"`
- `refreshInterval`: Polling interval in ms
- `plugins`: Plugin enable/disable settings
- `budgets`: Daily/weekly/monthly budget limits

## Credential Discovery Order

**IMPORTANT: OpenCode is ALWAYS checked first!**

1. **OpenCode auth** (`~/.local/share/opencode/auth.json`) - PRIMARY SOURCE
   - Provides OAuth tokens needed for usage tracking APIs
   - Contains tokens for: anthropic, openai, google, github-copilot
2. Environment variables (`ANTHROPIC_API_KEY`, etc.) - fallback
3. External CLI auth files (Claude Code, Gemini CLI, etc.) - last resort

**Why OpenCode first?** Usage tracking APIs (like Anthropic's `/api/oauth/usage`) require OAuth tokens, not API keys. OpenCode stores OAuth tokens from its authentication flow. If we check environment variables first, we'd get API keys which don't work for usage tracking.

**DO NOT** change this order without understanding the implications for OAuth vs API key authentication.

### Cross-Platform Credential Storage

Known credential locations by tool and platform:

| Tool | macOS | Linux | Windows |
|------|-------|-------|---------|
| OpenCode | `~/.local/share/opencode/auth.json` | `~/.local/share/opencode/auth.json` | `%APPDATA%/opencode/auth.json` (TBD) |
| Claude Code | macOS Keychain ("Claude Code-credentials") | **Unknown** | **Unknown** |
| Antigravity | `~/.config/opencode/antigravity-accounts.json` | Same | Same |

**TODO**: Research where Claude Code stores credentials on Linux and Windows. On macOS it uses the system Keychain and the file `~/.claude/.credentials.json` is empty.

## Cost Estimation

When actual billing data isn't available:

1. Track token usage from session parsing
2. Fetch pricing from models.dev API (24hr cache)
3. Fall back to built-in pricing data
4. Calculate: `cost = (tokens / 1M) * price_per_million`

Display estimated costs with `~` indicator: `~$0.0234`

## Testing Guidelines

- Unit tests for all plugin interfaces
- Integration tests for credential discovery
- Snapshot tests for TUI components
- Mock external APIs in tests

## Code Style

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use async/await over raw promises
- Document public APIs with JSDoc
- Keep functions small and focused
- Use meaningful variable names

## Git Workflow

- Feature branches from `main`
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`
- PR required for all changes
- CI must pass before merge

## TUI Debugging System

**IMPORTANT FOR AI AGENTS**: When the user reports visual bugs, animation issues, or says "something looks wrong" - IMMEDIATELY check for captured frames. The user captures frames to show you exactly what they see.

### Frame Location (CHECK THIS FIRST)

```
~/.local/share/tokentop/logs/frames/
```

**Always check for recent frames when debugging UI issues:**
```bash
# List recent frames (most recent last)
ls -la ~/.local/share/tokentop/logs/frames/ | tail -20

# Read a specific frame
cat ~/.local/share/tokentop/logs/frames/frame-*.txt

# Read burst captures (10 sequential frames showing animation/changes)
ls ~/.local/share/tokentop/logs/frames/burst-*/
cat ~/.local/share/tokentop/logs/frames/burst-*/frame-0001.txt
```

### What Frames Show You

Frames are **exact terminal snapshots** - they show precisely what the user sees. Use them to:
- See real data values (costs, tokens, rates) at capture time
- Observe animation behavior across burst frames
- Identify layout issues (overflow, misalignment, ghost text)
- Verify fixes without running the app yourself

### Frame Types

| Type | Location | Purpose |
|------|----------|---------|
| Manual frame | `frame-{timestamp}-manual.txt` | Single snapshot (Ctrl+P) |
| Burst frames | `burst-{timestamp}/frame-0001.txt` through `frame-0010.txt` | 10 sequential frames showing changes over time (Ctrl+Shift+P) |

### Capture Shortcuts (In-App)

| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | Capture single frame to file |
| `Ctrl+Shift+P` | Start/stop burst recording (10 frames) |
| `Shift+D` | Toggle Debug Inspector overlay |
| `~` | Toggle debug console |

### AI Debugging Workflow

1. **User reports issue** → Check `~/.local/share/tokentop/logs/frames/` for recent captures
2. **Read the frames** → `cat` the .txt files to see exactly what's displayed
3. **For animation issues** → Compare burst frames sequentially (frame-0001 through frame-0010)
4. **Analyze the data** → Look at actual values, timing, layout
5. **Fix and verify** → Ask user to capture new frame after fix

### Headless Snapshot Tool

Render components in isolation without running the full app:

```bash
# List all available components
bun src/tui/debug/snapshot.tsx --list

# Snapshot a specific component
bun src/tui/debug/snapshot.tsx debug-inspector
bun src/tui/debug/snapshot.tsx provider-card

# Snapshot all 16 registered components
bun src/tui/debug/snapshot.tsx --all

# Custom dimensions
bun src/tui/debug/snapshot.tsx header --width 120 --height 5

# Custom output path
bun src/tui/debug/snapshot.tsx toast --output my-toast.txt
```

**Available components**: debug-inspector, header, status-bar, provider-card, provider-card-loading, provider-card-unconfigured, provider-card-error, usage-gauge, toast, toast-error, toast-warning, spinner, skeleton-text, skeleton-gauge, skeleton-provider, debug-console

### Common OpenTUI Layout Fixes

**Ghost Characters** (old text bleeding through):
```tsx
// Problem: Dynamic text leaves artifacts
<text width={20}>{dynamicValue}</text>

// Solution: Use padRight AND height={1}
function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}
<text width={20} height={1}>{padRight(dynamicValue, 20)}</text>
```

**Row Overlap** (rows stacking on each other):
```tsx
// Problem: Rows without explicit height overlap
<box flexDirection="row">
  <text>Column 1</text>
  <text>Column 2</text>
</box>

// Solution: Add height={1} to container and text elements
<box flexDirection="row" height={1}>
  <text height={1}>Column 1</text>
  <text height={1}>Column 2</text>
</box>
```

**Content Overflow** (text outside container borders):
```tsx
// Problem: Content overflows container
<box width={35} border>
  <text>{longText}</text>
</box>

// Solution: Add overflow="hidden"
<box width={35} border overflow="hidden">
  <text>{longText}</text>
</box>
```

### Adding Components to Snapshot Tool

1. Create mock data factory in `src/tui/debug/snapshot.tsx`:
```tsx
function createMockMyComponentProps() {
  return {
    title: 'Test',
    value: 42,
  };
}
```

2. Register in `COMPONENT_REGISTRY`:
```tsx
'my-component': {
  name: 'MyComponent',
  description: 'Brief description',
  defaultWidth: 40,
  defaultHeight: 10,
  render: () => <MyComponent {...createMockMyComponentProps()} />,
},
```

3. Component is now available: `bun src/tui/debug/snapshot.tsx my-component`

See `docs/debugging.md` for comprehensive documentation.

## TUI Driver (Headless Automation)

The TUI driver allows AI agents to control tokentop programmatically without a real terminal. Use it for automated testing, capturing screenshots, or verifying UI behavior.

### CLI vs Programmatic

| Approach | When to Use |
|----------|-------------|
| **CLI** (pipe JSON) | Simple linear workflows, quick captures, CI/CD pipelines, any language |
| **Programmatic** (TypeScript) | Conditional logic, loops, assertions, frame parsing, building tools |

### CLI Usage

Pipe JSON commands to stdin. Each command executes sequentially.

```bash
echo '{"action":"launch","width":80,"height":24}
{"action":"waitForStable"}
{"action":"pressKey","key":"5"}
{"action":"waitForStable"}
{"action":"snapshot","name":"settings-view"}
{"action":"close"}' | bun run driver 2>/dev/null
```

**Critical**: Always use `{"action":"waitForStable"}` after navigation. Commands execute faster than the UI renders.

#### Available Actions

| Action | Parameters | Description |
|--------|------------|-------------|
| `launch` | `width`, `height`, `debug` | Start the app |
| `close` | - | Stop the app |
| `pressKey` | `key`, `modifiers` | Press a single key |
| `pressTab` | - | Press Tab |
| `pressEnter` | - | Press Enter |
| `pressEscape` | - | Press Escape |
| `pressArrow` | `direction` (up/down/left/right) | Press arrow key |
| `typeText` | `text`, `delay` | Type a string |
| `sendKeys` | `keys` | Send key sequence |
| `capture` | `meta`, `save` | Get current frame |
| `snapshot` | `name`, `dir` | Save frame to file |
| `waitForStable` | `maxIterations`, `intervalMs` | Wait for UI to settle |
| `waitForText` | `text`, `timeout` | Wait for text to appear |
| `resize` | `cols`, `rows` | Resize terminal |
| `status` | - | Get driver status |
| `help` | - | List all commands |

### Programmatic Usage

```typescript
import { createDriver } from './src/tui/driver/driver.ts';

const driver = await createDriver({ width: 80, height: 24 });
await driver.launch();
await driver.waitForStable();

// Navigate to settings
await driver.pressKey('5');
await driver.waitForStable();

// Capture and analyze frame
const frame = await driver.capture();
if (frame.includes('ALERTS')) {
  console.log('Found alerts section');
}

await driver.close();
```

### Example: Capture Alerts Settings (CLI)

```bash
echo '{"action":"launch","width":80,"height":24}
{"action":"waitForStable"}
{"action":"pressKey","key":"5"}
{"action":"waitForStable"}
{"action":"pressTab"}
{"action":"waitForStable"}
{"action":"pressArrow","direction":"down"}
{"action":"waitForStable"}
{"action":"pressArrow","direction":"down"}
{"action":"waitForStable"}
{"action":"pressArrow","direction":"down"}
{"action":"waitForStable"}
{"action":"snapshot","name":"alerts-settings"}
{"action":"close"}' | bun run driver 2>/dev/null
```

Settings opens with focus on settings pane. Tab switches to categories pane. Arrow down 3 times: Refresh → Display → Budgets → Alerts.

### Example: Filter Dashboard by Model (CLI)

```bash
echo '{"action":"launch","width":80,"height":24}
{"action":"waitForStable"}
{"action":"pressKey","key":"t"}
{"action":"pressKey","key":"t"}
{"action":"pressKey","key":"t"}
{"action":"pressKey","key":"t"}
{"action":"waitForStable"}
{"action":"pressKey","key":"/"}
{"action":"waitForStable"}
{"action":"typeText","text":"opus"}
{"action":"waitForStable"}
{"action":"snapshot","name":"dashboard-7d-opus"}
{"action":"close"}' | bun run driver 2>/dev/null
```

Press `t` 4 times to cycle to 7d window. Press `/` for filter mode. Type query.

### Example: Conditional Logic (Programmatic)

```typescript
import { createDriver } from './src/tui/driver/driver.ts';

async function checkSessionCount(query: string): Promise<number> {
  const driver = await createDriver({ width: 100, height: 30 });
  await driver.launch();
  await driver.waitForStable();
  
  await driver.pressKey('/');
  await driver.waitForStable();
  await driver.typeText(query);
  await driver.waitForStable();
  
  const frame = await driver.capture();
  const match = frame.match(/\[.*\] (\d+) sessions?/);
  const count = match ? parseInt(match[1], 10) : 0;
  
  await driver.close();
  return count;
}

const opusSessions = await checkSessionCount('opus');
console.log(`Found ${opusSessions} opus sessions`);
```

### Keyboard Reference

**Global**: `1-5` switch views, `q` quit, `r` refresh, `~` debug console

**Dashboard**: `t` cycle time window, `/` or `f` filter, `s` sort, `v` toggle view, `↑↓` navigate

**Settings**: `Tab` switch panes, `↑↓` navigate, `←→` adjust values, `Enter` toggle

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Blank/incomplete frames | Add `waitForStable` after navigation |
| Commands ignored | Increase `maxIterations` in waitForStable |
| React act() warnings | Redirect stderr: `2>/dev/null` |

### File Locations

- Driver: `src/tui/driver/driver.ts`
- CLI: `src/tui/driver/cli.ts`
- Snapshots: `./snapshots/`
