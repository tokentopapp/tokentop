import type {
  CredentialResult,
  Credentials,
  PluginContext,
  ProviderAuth,
  ProviderFetchContext,
  ProviderPlugin,
  ProviderUsageData,
  UsageLimit,
} from "../types/provider.ts";

const ZAI_USAGE_URL = "https://api.z.ai/api/monitor/usage/quota/limit";

interface ZaiLimitEntry {
  type?: string;
  usage?: number;
  currentValue?: number;
  remaining?: number;
  percentage?: number;
}

interface ZaiUsageResponse {
  success?: boolean;
  data?: {
    limits?: ZaiLimitEntry[];
  };
}

export const zaiCodingPlanPlugin: ProviderPlugin = {
  apiVersion: 2,
  id: "zai-coding-plan",
  type: "provider",
  name: "Z.ai Coding Plan",
  version: "1.0.0",

  meta: {
    description: "Z.ai coding plan usage and quota tracking",
    homepage: "https://z.ai",
    brandColor: "#10b981",
  },

  permissions: {
    network: {
      enabled: true,
      allowedDomains: ["api.z.ai"],
    },
    filesystem: {
      read: true,
      paths: ["~/.local/share/opencode"],
    },
    env: {
      read: true,
      vars: ["ZAI_API_KEY"],
    },
  },

  capabilities: {
    usageLimits: true,
    apiRateLimits: false,
    tokenUsage: false,
    actualCosts: false,
  },

  auth: {
    async discover(ctx: PluginContext): Promise<CredentialResult> {
      // 1. Try OpenCode auth (api, wellknown, or oauth)
      const entry =
        (await ctx.authSources.opencode.getProviderEntry("zhipuai-coding-plan")) ||
        (await ctx.authSources.opencode.getProviderEntry("zai-coding-plan"));
      if (entry) {
        if (entry.type === "api" && entry.key) {
          return { ok: true, credentials: { apiKey: entry.key, source: "opencode" } };
        }
        if (entry.type === "wellknown" && (entry.token || entry.key)) {
          return {
            ok: true,
            credentials: { apiKey: (entry.token || entry.key)!, source: "opencode" },
          };
        }
        if (entry.type === "oauth" && entry.access) {
          return { ok: true, credentials: { apiKey: entry.access, source: "opencode" } };
        }
      }

      // 2. Try env vars
      const apiKey = ctx.authSources.env.get("ZAI_API_KEY");
      if (apiKey) {
        return { ok: true, credentials: { apiKey, source: "env" } };
      }

      return {
        ok: false,
        reason: "missing",
        message: "No Z.ai API key found. Configure Z.ai in OpenCode.",
      };
    },

    isConfigured(credentials: Credentials): boolean {
      return !!(credentials.apiKey || credentials.oauth?.accessToken);
    },
  } satisfies ProviderAuth,

  async fetchUsage(ctx: ProviderFetchContext): Promise<ProviderUsageData> {
    const { credentials, http, logger: log } = ctx;

    const token = credentials.apiKey || credentials.oauth?.accessToken;

    if (!token) {
      return {
        fetchedAt: Date.now(),
        error: "API key required. Configure Z.ai in OpenCode.",
      };
    }

    try {
      const response = await http.fetch(ZAI_USAGE_URL, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        log.warn("Failed to fetch Z.ai usage", { status: response.status });

        if (response.status === 401 || response.status === 403) {
          return {
            fetchedAt: Date.now(),
            error: "Authorization failed. Check your Z.ai API key.",
          };
        }

        return {
          fetchedAt: Date.now(),
          error: `API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as ZaiUsageResponse;

      if (!data || data.success !== true) {
        return {
          fetchedAt: Date.now(),
          planType: "Z.ai",
          allowed: true,
        };
      }

      const limits = data.data?.limits ?? [];
      if (limits.length === 0) {
        return {
          fetchedAt: Date.now(),
          planType: "Z.ai",
          allowed: true,
        };
      }

      const parsedLimits = limits
        .map((limit) => ({
          type: limit.type,
          usedPercent: resolveUsedPercent(limit),
          remaining: limit.remaining,
        }))
        .filter((l) => l.usedPercent !== null);

      let primary: UsageLimit | undefined;
      for (const limit of parsedLimits) {
        if (limit.usedPercent === null) continue;
        if (!primary || limit.usedPercent > (primary.usedPercent ?? 0)) {
          primary = {
            usedPercent: limit.usedPercent,
            label: formatLimitType(limit.type),
          };
        }
      }

      const limitReached = parsedLimits.some(
        (l) =>
          (l.usedPercent !== null && l.usedPercent >= 100) ||
          (typeof l.remaining === "number" && l.remaining <= 0),
      );

      const result: ProviderUsageData = {
        planType: "Z.ai Coding Plan",
        allowed: !limitReached,
        limitReached,
        fetchedAt: Date.now(),
      };

      if (primary) {
        result.limits = { primary };
      }

      return result;
    } catch (err) {
      log.error("Failed to fetch Z.ai usage", { error: err });
      return {
        fetchedAt: Date.now(),
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
};

function resolveUsedPercent(limit: ZaiLimitEntry): number | null {
  if (typeof limit.percentage === "number") {
    return Math.round(Math.max(0, Math.min(100, limit.percentage)));
  }

  const total = limit.usage;
  const used =
    typeof limit.currentValue === "number"
      ? limit.currentValue
      : total !== undefined && typeof limit.remaining === "number"
        ? Math.max(0, total - limit.remaining)
        : undefined;

  if (total && used !== undefined && total > 0) {
    return Math.round((used / total) * 100);
  }

  return null;
}

function formatLimitType(type?: string): string {
  if (!type) return "Quota";
  switch (type) {
    case "TIME_LIMIT":
      return "Time";
    case "TOKENS_LIMIT":
      return "Tokens";
    default:
      return type.replace(/_/g, " ").toLowerCase();
  }
}
