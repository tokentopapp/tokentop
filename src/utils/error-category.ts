export type ProviderErrorCategory =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "network"
  | "insufficient_credits"
  | "unknown";

export function classifyProviderError(error: string): ProviderErrorCategory {
  const lower = error.toLowerCase();

  // Auth errors: expired tokens, invalid credentials, scope issues
  if (
    lower.includes("expired") ||
    lower.includes("re-authenticate") ||
    lower.includes("invalid") ||
    lower.includes("unauthorized") ||
    lower.includes("scope") ||
    lower.includes("authentication failed") ||
    lower.includes("authorization failed") ||
    lower.includes("check api key") ||
    lower.includes("api key required") ||
    lower.includes("token required") ||
    lower.includes("not configured") ||
    lower.includes("sign in") ||
    lower.includes("refresh failed") ||
    lower.includes("not enabled") ||
    lower.includes("configure") ||
    /\b401\b/.test(lower) ||
    /\b403\b/.test(lower)
  ) {
    return "auth";
  }

  // Rate limits
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    /\b429\b/.test(lower)
  ) {
    return "rate_limit";
  }

  // Insufficient credits
  if (lower.includes("insufficient") || lower.includes("credits") || /\b402\b/.test(lower)) {
    return "insufficient_credits";
  }

  // Timeouts
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("etimedout") ||
    lower.includes("aborted")
  ) {
    return "timeout";
  }

  // Network errors
  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network") ||
    lower.includes("fetch failed") ||
    lower.includes("dns") ||
    lower.includes("econnreset")
  ) {
    return "network";
  }

  return "unknown";
}

interface ErrorCategoryDisplay {
  label: string;
  icon: string;
  isWarning: boolean;
}

const CATEGORY_DISPLAY: Record<ProviderErrorCategory, ErrorCategoryDisplay> = {
  auth: { label: "AUTH", icon: "\u26B7", isWarning: true },
  rate_limit: { label: "RATE", icon: "\u29D7", isWarning: true },
  timeout: { label: "TIME", icon: "\u29D7", isWarning: true },
  insufficient_credits: { label: "CRED", icon: "\u2717", isWarning: true },
  network: { label: "NET", icon: "\u2717", isWarning: false },
  unknown: { label: "ERR", icon: "\u2717", isWarning: false },
};

export function getErrorCategoryDisplay(category: ProviderErrorCategory): ErrorCategoryDisplay {
  return CATEGORY_DISPLAY[category];
}
