import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { type AgentSessionUsage, createAgentPlugin } from "@tokentop/plugin-sdk";

const PI_HOME = path.join(os.homedir(), ".pi/agent");
const PI_SESSIONS_PATH = path.join(PI_HOME, "sessions");

interface PiSessionEntry {
  type?: string;
  cwd?: string;
  timestamp?: string;
  message?: {
    role?: string;
    model?: string;
    provider?: string;
    timestamp?: number;
    usage?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
    };
  };
}

function resolveProviderId(model: string, rawProvider?: string): string {
  if (rawProvider === "openai-codex" || rawProvider === "openai") return "openai";
  if (rawProvider === "anthropic" || rawProvider === "pi-claude-cli") return "anthropic";
  if (rawProvider === "xai") return "xai";
  if (rawProvider === "gemini-local" || rawProvider === "gemini") return "gemini";

  const lower = model.toLowerCase();
  if (lower.startsWith("claude")) return "anthropic";
  if (
    lower.startsWith("gpt") ||
    lower.startsWith("o1") ||
    lower.startsWith("o3") ||
    lower.startsWith("o4")
  ) {
    return "openai";
  }
  if (lower.startsWith("grok")) return "xai";
  if (lower.startsWith("gemini")) return "gemini";
  if (lower.startsWith("deepseek")) return "deepseek";
  return "openai";
}

export const piAgentPlugin = createAgentPlugin({
  id: "pi",
  type: "agent",
  name: "Pi",
  version: "1.0.0",
  meta: {
    description: "Pi (Earendil coding agent) session and token tracking",
    homepage: "https://github.com/earendil-works/pi-coding-agent",
  },
  permissions: {
    filesystem: {
      read: true,
      paths: ["~/.pi/agent"],
    },
  },
  agent: {
    name: "Pi",
    command: "pi",
    configPath: PI_HOME,
    sessionPath: PI_SESSIONS_PATH,
  },
  capabilities: {
    sessionParsing: true,
    authReading: false,
    realTimeTracking: false,
    multiProvider: true,
  },
  async isInstalled(_ctx) {
    try {
      await fs.access(PI_SESSIONS_PATH);
      return true;
    } catch {
      return false;
    }
  },
  async parseSessions(options, _ctx) {
    const sessions: AgentSessionUsage[] = [];
    let projectDirs: import("node:fs").Dirent[];
    try {
      projectDirs = await fs.readdir(PI_SESSIONS_PATH, { withFileTypes: true });
    } catch {
      return [];
    }

    for (const pDir of projectDirs) {
      if (!pDir.isDirectory()) continue;
      const projectDirPath = path.join(PI_SESSIONS_PATH, pDir.name);
      let files: string[];
      try {
        files = await fs.readdir(projectDirPath);
      } catch {
        continue;
      }

      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const filePath = path.join(projectDirPath, f);
        let stat: import("node:fs").Stats;
        try {
          stat = await fs.stat(filePath);
        } catch {
          continue;
        }

        if (options.since && stat.mtimeMs < options.since) continue;

        let content: string;
        try {
          content = await fs.readFile(filePath, "utf-8");
        } catch {
          continue;
        }

        let projectPath = "";
        let sessionId = f.replace(/\.jsonl$/, "");
        if (sessionId.includes("_")) {
          sessionId = sessionId.split("_").pop() ?? sessionId;
        }

        const lines = content.split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          let entry: PiSessionEntry;
          try {
            entry = JSON.parse(line) as PiSessionEntry;
          } catch {
            continue;
          }

          if (entry.type === "session" && entry.cwd) {
            projectPath = entry.cwd;
          }

          if (
            entry.type === "message" &&
            entry.message?.role === "assistant" &&
            entry.message?.usage
          ) {
            const usage = entry.message.usage;
            const modelId = entry.message.model || "unknown";
            const providerId = resolveProviderId(modelId, entry.message.provider);
            const timestamp =
              entry.message.timestamp ||
              (entry.timestamp ? Date.parse(entry.timestamp) : 0) ||
              stat.mtimeMs;

            const usageRow: AgentSessionUsage = {
              sessionId,
              providerId,
              modelId,
              tokens: {
                input: usage.input || 0,
                output: usage.output || 0,
              },
              timestamp,
              sessionUpdatedAt: stat.mtimeMs,
            };

            if (usage.cacheRead && usage.cacheRead > 0) {
              usageRow.tokens.cacheRead = usage.cacheRead;
            }
            if (usage.cacheWrite && usage.cacheWrite > 0) {
              usageRow.tokens.cacheWrite = usage.cacheWrite;
            }
            if (projectPath) {
              usageRow.projectPath = projectPath;
            }

            sessions.push(usageRow);
          }
        }
      }
    }

    return sessions;
  },
});

export default piAgentPlugin;
