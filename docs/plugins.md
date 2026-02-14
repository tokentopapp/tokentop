# Plugins

tokentop's plugin system lets you add new providers, coding agents, themes, and notification channels.

## Quick Start

```bash
# Install the SDK
bun add @tokentop/plugin-sdk
```

Add community plugins to your config and they auto-install on next launch:

```jsonc
// ~/.config/tokentop/config.json
{
  "plugins": {
    "npm": ["tokentop-provider-replicate", "tokentop-theme-catppuccin"]
  }
}
```

Or load a local plugin for development:

```bash
ttop --plugin ./my-plugin
```

## Plugin Types

| Type | Purpose |
|------|---------|
| **Provider** | Fetch usage data from an AI model provider |
| **Agent** | Parse coding agent sessions for token tracking |
| **Theme** | Color scheme for the TUI |
| **Notification** | Alert delivery (Slack, Discord, terminal bell, etc.) |

## Naming Convention

### Official plugins (`@tokentop/*`)

Maintained by the tokentop team. Published under the `@tokentop` npm org.

| Type | npm name |
|------|----------|
| Provider | `@tokentop/provider-anthropic` |
| Agent | `@tokentop/agent-opencode` |
| Theme | `@tokentop/theme-dracula` |
| Notification | `@tokentop/notification-slack` |

### Community plugins (`tokentop-*`)

Published by anyone — no npm org membership needed:

| Type | npm name |
|------|----------|
| Provider | `tokentop-provider-replicate` |
| Agent | `tokentop-agent-windsurf` |
| Theme | `tokentop-theme-catppuccin` |
| Notification | `tokentop-notification-ntfy` |

Scoped community plugins also work: `@yourname/tokentop-provider-foo`

## Loading Plugins

Plugins load from three sources, in order:

1. **Builtins** — shipped with tokentop
2. **Local plugins** — from the plugins directory, config paths, and CLI flags
3. **npm plugins** — auto-installed from config on startup

### npm Plugins (Auto-Install)

List packages in your config. tokentop installs them automatically into `~/.cache/tokentop/` on launch:

```jsonc
{
  "plugins": {
    "npm": [
      "tokentop-theme-catppuccin",
      "tokentop-provider-replicate@1.0.0"
    ]
  }
}
```

Pin a version with `@1.0.0` or omit for latest.

### CLI Flag (`--plugin`)

Load a plugin for a single run. Repeatable.

```bash
ttop --plugin ~/dev/my-provider
ttop --plugin ./theme-catppuccin --plugin ./provider-foo
```

Paths can be:
- A directory with a `package.json`, `src/index.ts`, or `index.ts`
- A single `.ts` or `.js` file

### Config File

Persistent plugin configuration lives in `~/.config/tokentop/config.json`:

```jsonc
{
  "plugins": {
    // Local paths — loaded every run
    "local": [
      "~/development/my-provider"
    ],

    // npm packages — auto-installed on startup
    "npm": [
      "tokentop-provider-replicate",
      "tokentop-theme-catppuccin"
    ],

    // Disable specific plugins by ID (including builtins)
    "disabled": [
      "perplexity",
      "visual-flash"
    ]
  }
}
```

### Plugins Directory

Drop plugins into `~/.config/tokentop/plugins/` and they're auto-discovered:

```
~/.config/tokentop/plugins/
├── my-theme.ts              # Single-file plugin
├── provider-foo/            # Directory plugin
│   ├── package.json
│   └── src/index.ts
└── quick-notification.js    # Single-file plugin
```

For directories, the loader checks entry points in this order:
1. `package.json` `main` or `exports["."]` field
2. `src/index.ts`
3. `index.ts`
4. `dist/index.js`

### Disabling Plugins

Any plugin (including builtins) can be disabled by adding its ID to `plugins.disabled`:

```jsonc
{
  "plugins": {
    "disabled": ["perplexity", "minimax", "terminal-bell"]
  }
}
```

## Permission Sandbox

All plugins declare what they need access to:

```typescript
permissions: {
  network: { enabled: true, allowedDomains: ['api.example.com'] },
  filesystem: { read: true, paths: ['~/.config/my-tool/'] },
  env: { read: true, vars: ['MY_API_KEY'] },
}
```

Core enforces these at runtime. A plugin cannot make network requests to domains it didn't declare, read env vars it didn't list, or access filesystem paths outside its allowlist.

## Building a Plugin

### Setup

```bash
mkdir tokentop-theme-monokai
cd tokentop-theme-monokai
bun init
bun add @tokentop/plugin-sdk
```

### Minimal Theme Plugin

Themes are the simplest plugin type — pure data, no async logic:

```typescript
// src/index.ts
import { createThemePlugin } from '@tokentop/plugin-sdk';

export default createThemePlugin({
  id: 'monokai',
  type: 'theme',
  name: 'Monokai',
  version: '1.0.0',
  meta: { description: 'Classic Monokai color scheme' },
  permissions: {},
  theme: {
    colorScheme: 'dark',
    colors: {
      bg: '#272822',
      fg: '#f8f8f2',
      border: '#75715e',
      borderFocused: '#a6e22e',
      primary: '#a6e22e',
      secondary: '#66d9ef',
      accent: '#f92672',
      muted: '#75715e',
      success: '#a6e22e',
      warning: '#e6db74',
      error: '#f92672',
      info: '#66d9ef',
      headerBg: '#1e1f1c',
      headerFg: '#f8f8f2',
      statusBarBg: '#1e1f1c',
      statusBarFg: '#75715e',
      tableBg: '#272822',
      tableHeaderBg: '#3e3d32',
      tableHeaderFg: '#a6e22e',
      tableRowBg: '#272822',
      tableRowAltBg: '#2d2e27',
      tableRowFg: '#f8f8f2',
      tableSelectedBg: '#49483e',
      tableSelectedFg: '#f8f8f2',
    },
  },
});
```

### Minimal Provider Plugin

```typescript
import {
  createProviderPlugin,
  apiKeyCredential,
  credentialFound,
  credentialMissing,
} from '@tokentop/plugin-sdk';

export default createProviderPlugin({
  id: 'my-provider',
  type: 'provider',
  name: 'My Provider',
  version: '1.0.0',
  meta: { brandColor: '#3b82f6' },
  permissions: {
    network: { enabled: true, allowedDomains: ['api.example.com'] },
    env: { read: true, vars: ['MY_API_KEY'] },
  },
  capabilities: {
    usageLimits: false,
    apiRateLimits: false,
    tokenUsage: false,
    actualCosts: true,
  },
  auth: {
    async discover(ctx) {
      const key = ctx.authSources.env.get('MY_API_KEY');
      return key ? credentialFound(apiKeyCredential(key)) : credentialMissing();
    },
    isConfigured: (creds) => !!creds.apiKey,
  },
  async fetchUsage(ctx) {
    const resp = await ctx.http.fetch('https://api.example.com/usage', {
      headers: { Authorization: `Bearer ${ctx.credentials.apiKey}` },
    });
    const data = await resp.json();
    return {
      fetchedAt: Date.now(),
      cost: { total: data.total, currency: 'USD', source: 'api' },
    };
  },
});
```

### Plugin Configuration

Plugins can declare user-configurable settings via `configSchema`. These render in the Settings UI automatically:

```typescript
export default createProviderPlugin({
  // ...
  configSchema: {
    apiEndpoint: {
      type: 'select',
      label: 'API Region',
      options: [
        { value: 'us', label: 'US' },
        { value: 'eu', label: 'EU' },
      ],
      default: 'us',
    },
    maxRetries: {
      type: 'number',
      label: 'Max Retries',
      description: 'Number of retry attempts on failure',
      default: 3,
      min: 0,
      max: 10,
    },
    verbose: {
      type: 'boolean',
      label: 'Verbose Logging',
      default: false,
    },
  },
  defaultConfig: {
    apiEndpoint: 'us',
    maxRetries: 3,
    verbose: false,
  },
  // ...
});
```

User values are persisted in `~/.config/tokentop/config.json` under `pluginConfig.<plugin-id>` and passed to your plugin via `ctx.config`.

### Testing

Test plugins without running tokentop using the SDK test harness:

```typescript
import { createTestContext } from '@tokentop/plugin-sdk/testing';
import plugin from './src/index.ts';

const ctx = createTestContext({
  env: { MY_API_KEY: 'test-key' },
  httpMocks: {
    'https://api.example.com/usage': {
      status: 200,
      body: { total: 4.50 },
    },
  },
});

const creds = await plugin.auth.discover(ctx);
assert(creds.ok);
```

### Test It Locally

```bash
ttop --plugin ./tokentop-theme-monokai
```

### Publish It

Use the `tokentop-{type}-` prefix for community plugins:

```json
{
  "name": "tokentop-theme-monokai",
  "main": "src/index.ts",
  "peerDependencies": {
    "@tokentop/plugin-sdk": "^1.0.0"
  }
}
```

```bash
npm publish
```

## Key Concepts

### API Version

All plugins must declare `apiVersion: 2`. Core validates this at load time and rejects incompatible plugins. The `createProviderPlugin()` / `createThemePlugin()` / etc. helpers stamp this automatically — you don't need to set it manually.

### Lifecycle Hooks

Plugins can optionally implement lifecycle hooks:

| Hook | When it's called |
|------|------------------|
| `initialize(ctx)` | Once after loading — setup connections, allocate resources |
| `start(ctx)` | Begin active work (polling, watching) |
| `stop(ctx)` | Pause active work |
| `destroy(ctx)` | Before unload — cleanup connections, flush buffers |
| `onConfigChange(config, ctx)` | When user changes plugin settings |

All hooks are optional. Most simple plugins don't need them.

### Error Isolation

Core wraps all plugin method calls with error isolation. If your plugin throws, it won't crash the app. After 5 consecutive failures, the plugin is temporarily disabled (60s cooldown) to prevent cascading errors.

### Plugin Storage

Plugins have access to persistent key-value storage via `ctx.storage`:

```typescript
await ctx.storage.set('lastSync', Date.now().toString());
const lastSync = await ctx.storage.get('lastSync');
```

Storage is namespaced per plugin — you can only access your own data.

## SDK Reference

For the full API — all plugin types, credential discovery patterns, notification events, and testing utilities — see the [Plugin SDK documentation](https://github.com/tokentopapp/plugin-sdk).

Install: `bun add @tokentop/plugin-sdk`
