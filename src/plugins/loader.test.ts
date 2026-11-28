import { describe, expect, test } from "bun:test";
import { CURRENT_API_VERSION } from "@tokentop/plugin-sdk";
import { loadNpmPlugin, validatePlugin } from "./loader.ts";

const validPlugin = {
  id: "test-plugin",
  type: "notification",
  name: "Test Plugin",
  version: "1.0.0",
  apiVersion: CURRENT_API_VERSION,
  permissions: {},
  initialize: async () => {},
  notify: async () => {},
};

function hasError(errors: string[], fragment: string): boolean {
  return errors.some((error) => error.includes(fragment));
}

describe("validatePlugin", () => {
  test("accepts a valid minimal plugin object", async () => {
    const result = await validatePlugin(validPlugin);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects plugin missing id", async () => {
    const plugin = {
      ...validPlugin,
      id: "",
    };

    const result = await validatePlugin(plugin);
    expect(result.valid).toBe(false);
    expect(hasError(result.errors, 'non-empty string "id"')).toBe(true);
  });

  test("rejects plugin with invalid id format", async () => {
    const plugin = {
      ...validPlugin,
      id: "Bad Plugin",
    };

    const result = await validatePlugin(plugin);
    expect(result.valid).toBe(false);
    expect(hasError(result.errors, "kebab-case")).toBe(true);
  });

  test("rejects plugin missing type", async () => {
    const plugin = {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      apiVersion: CURRENT_API_VERSION,
      permissions: {},
    };

    const result = await validatePlugin(plugin);
    expect(result.valid).toBe(false);
    expect(hasError(result.errors, "must be one of")).toBe(true);
  });

  test("rejects plugin with invalid type", async () => {
    const plugin = {
      ...validPlugin,
      type: "invalid",
    };

    const result = await validatePlugin(plugin);
    expect(result.valid).toBe(false);
    expect(hasError(result.errors, "provider, agent, theme, notification")).toBe(true);
  });

  test("rejects plugin missing name", async () => {
    const plugin = {
      ...validPlugin,
      name: "",
    };

    const result = await validatePlugin(plugin);
    expect(result.valid).toBe(false);
    expect(hasError(result.errors, 'non-empty string "name"')).toBe(true);
  });

  test("rejects plugin missing version", async () => {
    const plugin = {
      ...validPlugin,
      version: "",
    };

    const result = await validatePlugin(plugin);
    expect(result.valid).toBe(false);
    expect(hasError(result.errors, 'valid semver "version"')).toBe(true);
  });

  test("rejects plugin with invalid version format", async () => {
    const plugin = {
      ...validPlugin,
      version: "v1",
    };

    const result = await validatePlugin(plugin);
    expect(result.valid).toBe(false);
    expect(hasError(result.errors, 'valid semver "version"')).toBe(true);
  });

  test("rejects plugin missing permissions", async () => {
    const plugin = {
      id: "test-plugin",
      type: "notification",
      name: "Test Plugin",
      version: "1.0.0",
      apiVersion: CURRENT_API_VERSION,
    };

    const result = await validatePlugin(plugin);
    expect(result.valid).toBe(false);
    expect(hasError(result.errors, 'declare "permissions" object')).toBe(true);
  });

  test("rejects plugin with wrong apiVersion", async () => {
    const plugin = {
      ...validPlugin,
      apiVersion: CURRENT_API_VERSION + 1,
    };

    const result = await validatePlugin(plugin);
    expect(result.valid).toBe(false);
    expect(hasError(result.errors, `expected ${CURRENT_API_VERSION}`)).toBe(true);
  });

  test("rejects provider plugin missing auth", async () => {
    const providerPlugin = {
      ...validPlugin,
      type: "provider",
      fetchUsage: async () => [],
    };

    const result = await validatePlugin(providerPlugin);
    expect(result.valid).toBe(false);
    expect(hasError(result.errors, 'declare "auth" object')).toBe(true);
  });

  test("accepts valid provider plugin with auth and fetchUsage", async () => {
    const providerPlugin = {
      ...validPlugin,
      type: "provider",
      auth: {
        discover: async () => undefined,
        isConfigured: () => true,
      },
      fetchUsage: async () => [],
    };

    const result = await validatePlugin(providerPlugin);
    expect(result.valid).toBe(true);
  });

  test("rejects theme plugin missing colors object", async () => {
    const themePlugin = {
      ...validPlugin,
      type: "theme",
      colorScheme: "dark",
    };

    const result = await validatePlugin(themePlugin);
    expect(result.valid).toBe(false);
    expect(hasError(result.errors, '"colors" object')).toBe(true);
  });

  test("rejects theme plugin missing colorScheme", async () => {
    const themePlugin = {
      ...validPlugin,
      type: "theme",
      colors: { primary: "#fff" },
    };

    const result = await validatePlugin(themePlugin);
    expect(result.valid).toBe(false);
    expect(hasError(result.errors, "colorScheme")).toBe(true);
  });

  test("accepts valid theme plugin", async () => {
    const themePlugin = {
      ...validPlugin,
      type: "theme",
      colorScheme: "dark",
      colors: { primary: "#fff" },
    };

    const result = await validatePlugin(themePlugin);
    expect(result.valid).toBe(true);
  });
});

describe("loadNpmPlugin name validation", () => {
  const invalidName = "Invalid npm plugin name";

  test.each([
    "@tokentop/provider-foo",
    "@tokentop/provider-foo@1.2.3",
    "tokentop-provider-foo",
    "tokentop-provider-foo@1.0.0",
    "@me/tokentop-agent-x",
    "@me/tokentop-agent-x@2.0.0",
  ])("accepts the package name %s", async (name) => {
    const result = await loadNpmPlugin(name, "/nonexistent/tokentop-test-plugin.js");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain(invalidName);
    }
  });

  test.each([
    "lodash",
    "@me/lodash",
    "@tokentop/other-foo@1.0.0",
  ])("rejects the package name %s", async (name) => {
    const result = await loadNpmPlugin(name, "/nonexistent/tokentop-test-plugin.js");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain(invalidName);
    }
  });
});
