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
