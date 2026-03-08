import { describe, expect, test } from "bun:test";
import { classifyProviderError } from "../error-category.ts";

describe("classifyProviderError", () => {
  describe("auth errors", () => {
    test("classifies expired token errors", () => {
      expect(classifyProviderError("Token expired. Run any command in OpenCode to refresh.")).toBe(
        "auth",
      );
      expect(
        classifyProviderError(
          "Token expired or invalid. Re-authenticate in OpenCode or Claude Code.",
        ),
      ).toBe("auth");
      expect(classifyProviderError("OAuth token expired. Re-authenticate in OpenCode.")).toBe(
        "auth",
      );
      expect(
        classifyProviderError("OAuth token expired or invalid. Re-authenticate in OpenCode."),
      ).toBe("auth");
      expect(
        classifyProviderError("OAuth token expired or invalid. Re-authenticate via Gemini CLI."),
      ).toBe("auth");
      expect(classifyProviderError("Claude Code token expired")).toBe("auth");
    });

    test("classifies scope errors", () => {
      expect(
        classifyProviderError(
          "Token lacks required scope. Re-authenticate in OpenCode or Claude Code.",
        ),
      ).toBe("auth");
    });

    test("classifies missing credential errors", () => {
      expect(
        classifyProviderError(
          "OAuth token or API key required. Authenticate via OpenCode or Claude Code.",
        ),
      ).toBe("auth");
      expect(
        classifyProviderError(
          "OAuth token required. Sign in via OpenCode with ChatGPT Pro account.",
        ),
      ).toBe("auth");
      expect(
        classifyProviderError("OAuth token required. Sign in via OpenCode with Google account."),
      ).toBe("auth");
      expect(
        classifyProviderError("OAuth token required. Login via Gemini CLI with Google account."),
      ).toBe("auth");
      expect(
        classifyProviderError("API key required. Set OPENAI_API_KEY environment variable."),
      ).toBe("auth");
      expect(
        classifyProviderError("API key required. Set PERPLEXITY_API_KEY environment variable."),
      ).toBe("auth");
      expect(classifyProviderError("API key required. Configure MiniMax in OpenCode.")).toBe(
        "auth",
      );
      expect(classifyProviderError("API key required. Configure Chutes in OpenCode.")).toBe("auth");
      expect(classifyProviderError("API key required. Configure Z.ai in OpenCode.")).toBe("auth");
      expect(
        classifyProviderError("API key required. Run /connect in OpenCode to set up Zen."),
      ).toBe("auth");
    });

    test("classifies authorization failure errors", () => {
      expect(classifyProviderError("Authorization failed. Check your MiniMax API key.")).toBe(
        "auth",
      );
      expect(classifyProviderError("Authorization failed. Check your Chutes API key.")).toBe(
        "auth",
      );
      expect(classifyProviderError("Authorization failed. Check your Z.ai API key.")).toBe("auth");
    });

    test("classifies invalid key errors", () => {
      expect(classifyProviderError("Invalid API key")).toBe("auth");
      expect(classifyProviderError("Unauthorized – check API key")).toBe("auth");
    });

    test("classifies HTTP status code auth errors", () => {
      expect(classifyProviderError("API error: 401 Unauthorized")).toBe("auth");
      expect(classifyProviderError("API error: 403 Forbidden")).toBe("auth");
      expect(classifyProviderError("Authentication failed (401). Check API key.")).toBe("auth");
    });

    test("classifies not-configured errors", () => {
      expect(classifyProviderError("Not configured: missing GitHub token")).toBe("auth");
      expect(classifyProviderError("Copilot not enabled for this account")).toBe("auth");
    });

    test("classifies refresh failure errors", () => {
      expect(classifyProviderError("No valid access token and refresh failed.")).toBe("auth");
      expect(
        classifyProviderError("ChatGPT account ID required. Re-authenticate in OpenCode."),
      ).toBe("auth");
      expect(
        classifyProviderError(
          "MiniMax groupId required. Set MINIMAX_GROUP_ID or configure in OpenCode.",
        ),
      ).toBe("auth");
    });
  });

  describe("rate limit errors", () => {
    test("classifies rate limit errors", () => {
      expect(classifyProviderError("Rate limited")).toBe("rate_limit");
      expect(classifyProviderError("API error: 429 Too Many Requests")).toBe("rate_limit");
    });
  });

  describe("insufficient credits errors", () => {
    test("classifies insufficient credits errors", () => {
      expect(classifyProviderError("Insufficient credits")).toBe("insufficient_credits");
    });
  });

  describe("timeout errors", () => {
    test("classifies timeout errors", () => {
      expect(classifyProviderError("The operation timed out")).toBe("timeout");
      expect(classifyProviderError("Request timeout")).toBe("timeout");
      expect(classifyProviderError("ETIMEDOUT")).toBe("timeout");
      expect(classifyProviderError("Request aborted")).toBe("timeout");
    });
  });

  describe("network errors", () => {
    test("classifies network errors", () => {
      expect(classifyProviderError("fetch failed")).toBe("network");
      expect(classifyProviderError("ECONNREFUSED")).toBe("network");
      expect(classifyProviderError("ENOTFOUND")).toBe("network");
      expect(classifyProviderError("ECONNRESET")).toBe("network");
      expect(classifyProviderError("DNS resolution failed")).toBe("network");
      expect(classifyProviderError("Network error")).toBe("network");
    });
  });

  describe("unknown errors", () => {
    test("classifies unrecognized errors as unknown", () => {
      expect(classifyProviderError("Unknown error")).toBe("unknown");
      expect(classifyProviderError("API error: 500 Internal Server Error")).toBe("unknown");
      expect(classifyProviderError("Something went wrong")).toBe("unknown");
    });
  });
});
