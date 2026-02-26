import type {
  CredentialResult,
  Credentials,
  PluginContext,
  ProviderAuth,
  ProviderFetchContext,
  ProviderPlugin,
  ProviderUsageData,
} from "../types/provider.ts";

const CHUTES_QUOTA_URL = "https://api.chutes.ai/users/me/quota_usage/me";

interface ChutesQuotaResponse {
  quota?: number;
  used?: number;
}

export const chutesPlugin: ProviderPlugin = {
  apiVersion: 2,
  id: "chutes",
  type: "provider",
  name: "Chutes",
  version: "1.0.0",

  meta: {
    description: "Chutes AI API quota and usage tracking",
    homepage: "https://chutes.ai",
    brandColor: "#6366f1",
  },

  permissions: {
    network: {
      enabled: true,
      allowedDomains: ["api.chutes.ai"],
    },
    filesystem: {
      read: true,
      paths: ["~/.local/share/opencode"],
    },
    env: {
      read: true,
      vars: ["CHUTES_API_KEY"],
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
      const entry = await ctx.authSources.opencode.getProviderEntry("chutes");
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

      const apiKey = ctx.authSources.env.get("CHUTES_API_KEY");
      if (apiKey) {
        return { ok: true, credentials: { apiKey, source: "env" } };
      }

      return {
        ok: false,
        reason: "missing",
        message: "No Chutes API key found. Configure Chutes in OpenCode.",
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
        error: "API key required. Configure Chutes in OpenCode.",
      };
    }

    try {
      const response = await http.fetch(CHUTES_QUOTA_URL, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        log.warn("Failed to fetch Chutes usage", { status: response.status });

        if (response.status === 401 || response.status === 403) {
          return {
            fetchedAt: Date.now(),
            error: "Authorization failed. Check your Chutes API key.",
          };
        }

        return {
          fetchedAt: Date.now(),
          error: `API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as ChutesQuotaResponse;

      if (!data || typeof data.quota !== "number" || typeof data.used !== "number") {
        return {
          fetchedAt: Date.now(),
          planType: "Chutes",
          allowed: true,
        };
      }

      const quota = data.quota;
      const used = data.used;
      const usedPercent = quota > 0 ? Math.round((used / quota) * 100) : 0;

      const planType = getTierFromQuota(quota);
      const resetAt = calculateNextReset();
      const limitReached = usedPercent >= 100;

      const result: ProviderUsageData = {
        planType,
        allowed: !limitReached,
        limitReached,
        fetchedAt: Date.now(),
      };

      if (usedPercent !== null) {
        result.limits = {
          primary: {
            usedPercent,
            label: "Daily quota",
            resetsAt: resetAt,
            windowMinutes: 1440,
          },
        };
      }

      return result;
    } catch (err) {
      log.error("Failed to fetch Chutes usage", { error: err });
      return {
        fetchedAt: Date.now(),
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
};

function getTierFromQuota(quota: number): string {
  const tierMap: Record<number, string> = {
    200: "Legacy",
    300: "Base",
    2000: "Plus",
    5000: "Pro",
  };

  return tierMap[quota] ?? `Custom (${quota})`;
}

function calculateNextReset(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.getTime();
}
