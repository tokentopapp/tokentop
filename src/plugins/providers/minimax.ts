import type {
  CredentialResult,
  Credentials,
  PluginContext,
  ProviderAuth,
  ProviderFetchContext,
  ProviderPlugin,
  ProviderUsageData,
} from "@tokentop/plugin-sdk";

const MINIMAX_USAGE_URL = "https://platform.minimax.io/v1/api/openplatform/coding_plan/remains";

interface MinimaxModelRemain {
  model_name?: string;
  current_interval_total_count?: number;
  current_interval_usage_count?: number;
  remains_time?: number;
}

interface MinimaxUsageResponse {
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
  model_remains?: MinimaxModelRemain[];
}

function createMinimaxPlugin(id: string, name: string): ProviderPlugin {
  return {
    apiVersion: 2,
    id,
    type: "provider",
    name,
    version: "1.0.0",

    meta: {
      description: `${name} usage and quota tracking`,
      homepage: "https://platform.minimax.io",
      brandColor: "#6366f1",
    },

    permissions: {
      network: {
        enabled: true,
        allowedDomains: ["platform.minimax.io"],
      },
      filesystem: {
        read: true,
        paths: ["~/.local/share/opencode"],
      },
      env: {
        read: true,
        vars: ["MINIMAX_API_KEY", "MINIMAX_GROUP_ID"],
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
        // 1. Try OpenCode auth (api type with key + groupId)
        const entry = await ctx.authSources.opencode.getProviderEntry(id);
        if (entry) {
          if (entry.type === "api" && entry.key) {
            return {
              ok: true,
              credentials: {
                apiKey: entry.key,
                ...(entry.groupId && { groupId: entry.groupId }),
                source: "opencode",
              },
            };
          }
          if (entry.type === "wellknown" && (entry.token || entry.key)) {
            return {
              ok: true,
              credentials: {
                apiKey: (entry.token || entry.key)!,
                ...(entry.groupId && { groupId: entry.groupId }),
                source: "opencode",
              },
            };
          }
        }

        // 2. Try env vars
        const apiKey = ctx.authSources.env.get("MINIMAX_API_KEY");
        if (apiKey) {
          const groupId = ctx.authSources.env.get("MINIMAX_GROUP_ID");
          return {
            ok: true,
            credentials: {
              apiKey,
              ...(groupId && { groupId }),
              source: "env",
            },
          };
        }

        return {
          ok: false,
          reason: "missing",
          message: "No MiniMax API key found. Configure MiniMax in OpenCode.",
        };
      },

      isConfigured(credentials: Credentials): boolean {
        return !!credentials.apiKey;
      },
    } satisfies ProviderAuth,

    async fetchUsage(ctx: ProviderFetchContext): Promise<ProviderUsageData> {
      const { credentials, http, logger: log, config } = ctx;

      const apiKey = credentials.apiKey;
      if (!apiKey) {
        return {
          fetchedAt: Date.now(),
          error: "API key required. Configure MiniMax in OpenCode.",
        };
      }

      const groupId =
        credentials.groupId ||
        (config.groupId as string | undefined) ||
        process.env.MINIMAX_GROUP_ID;

      if (!groupId) {
        return {
          fetchedAt: Date.now(),
          error: "MiniMax groupId required. Set MINIMAX_GROUP_ID or configure in OpenCode.",
        };
      }

      try {
        const url = `${MINIMAX_USAGE_URL}?GroupId=${encodeURIComponent(groupId)}`;
        const response = await http.fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Referer: "https://platform.minimax.io/user-center/payment/coding-plan",
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          log.warn("Failed to fetch MiniMax usage", { status: response.status });
          // Drain the response body to prevent memory leaks in Bun's fetch implementation
          response.body?.cancel();

          if (response.status === 429) {
            const retryAfterHeader = response.headers.get("retry-after");
            const parsedRetryAfter = retryAfterHeader
              ? Number.parseInt(retryAfterHeader, 10)
              : Number.NaN;
            const retrySec =
              Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0 ? parsedRetryAfter : 300;
            log.warn("Rate limited by MiniMax API", { retryAfterHeader, retryAfterSec: retrySec });
            return {
              fetchedAt: Date.now(),
              error: `Rate limited. Retry after ${retrySec}s.`,
              rateLimited: true,
              retryAfterMs: retrySec * 1000,
            };
          }

          if (response.status === 401 || response.status === 403) {
            return {
              fetchedAt: Date.now(),
              error: "Authorization failed. Check your MiniMax API key.",
            };
          }

          return {
            fetchedAt: Date.now(),
            error: `API error: ${response.status} ${response.statusText}`,
          };
        }

        const data = (await response.json()) as MinimaxUsageResponse;

        if (!data || data.base_resp?.status_code !== 0) {
          const errorMsg = data?.base_resp?.status_msg || "Unknown error";
          return {
            fetchedAt: Date.now(),
            error: `MiniMax API error: ${errorMsg}`,
          };
        }

        const modelRemains = data.model_remains ?? [];
        if (modelRemains.length === 0) {
          return {
            fetchedAt: Date.now(),
            planType: "MiniMax Coding Plan",
            allowed: true,
          };
        }

        const model = modelRemains[0]!;
        const totalCount = model.current_interval_total_count ?? 0;
        const remainingCount = model.current_interval_usage_count ?? 0;
        const remainsTime = model.remains_time ?? 0;

        const usedCount = totalCount > 0 ? totalCount - remainingCount : 0;
        const usedPercent = totalCount > 0 ? Math.round((usedCount / totalCount) * 100) : 0;

        const limitReached = usedCount >= totalCount && totalCount > 0;

        const result: ProviderUsageData = {
          planType: model.model_name || "MiniMax Coding Plan",
          allowed: !limitReached,
          limitReached,
          limits: {
            primary: {
              usedPercent,
              label: "Requests",
            },
          },
          fetchedAt: Date.now(),
        };

        if (remainsTime > 0 && result.limits?.primary) {
          result.limits.primary.resetsAt = Date.now() + remainsTime;
        }

        return result;
      } catch (err) {
        log.error("Failed to fetch MiniMax usage", { error: err });
        return {
          fetchedAt: Date.now(),
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },
  };
}

export const minimaxPlugin = createMinimaxPlugin("minimax", "MiniMax");
export const minimaxCodingPlanPlugin = createMinimaxPlugin(
  "minimax-coding-plan",
  "MiniMax Coding Plan",
);
