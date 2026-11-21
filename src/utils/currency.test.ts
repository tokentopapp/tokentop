import { describe, expect, test } from "bun:test";
import {
  formatBudgetDisplay,
  formatCurrency,
  isValidCurrencyInput,
  parseCurrencyInput,
} from "./currency.ts";

describe("parseCurrencyInput", () => {
  test("returns null for empty or whitespace input", () => {
    expect(parseCurrencyInput("")).toBeNull();
    expect(parseCurrencyInput("   ")).toBeNull();
  });

  test("parses US format with thousands and decimal separators", () => {
    expect(parseCurrencyInput("1,234.56")).toBe(1234.56);
  });

  test("parses European format with period thousands and comma decimal", () => {
    expect(parseCurrencyInput("1.234,56")).toBe(1234.56);
  });

  test("parses plain numbers", () => {
    expect(parseCurrencyInput("42.50")).toBe(42.5);
  });

  test("strips supported currency symbols before parsing", () => {
    expect(parseCurrencyInput("$100")).toBe(100);
    expect(parseCurrencyInput("€100")).toBe(100);
    expect(parseCurrencyInput("£100")).toBe(100);
  });

  test("treats comma as decimal separator when not thousands grouping", () => {
    expect(parseCurrencyInput("10,50")).toBe(10.5);
  });

  test("treats comma as thousands separator with 3 digits after comma", () => {
    expect(parseCurrencyInput("1,234")).toBe(1234);
  });

  test("treats repeated commas as thousands separators", () => {
    expect(parseCurrencyInput("1,000,000")).toBe(1000000);
    expect(parseCurrencyInput("1,234,567")).toBe(1234567);
    expect(parseCurrencyInput("$1,500,000.50")).toBe(1500000.5);
  });

  test("treats repeated periods as thousands separators", () => {
    expect(parseCurrencyInput("1.234.567")).toBe(1234567);
  });

  test("returns null for invalid input", () => {
    expect(parseCurrencyInput("abc")).toBeNull();
  });

  test("rounds parsed values to 2 decimal places", () => {
    const parsed = parseCurrencyInput("10.129");
    expect(parsed).toBe(Math.round(10.129 * 100) / 100);
  });
});

describe("formatCurrency", () => {
  test("returns None for null input", () => {
    expect(formatCurrency(null)).toBe("None");
  });

  test("formats compact values >= 1000 as k notation", () => {
    expect(formatCurrency(1234, { compact: true })).toBe("$1.2k");
  });

  test("formats compact values >= 100 as rounded integer", () => {
    expect(formatCurrency(234.4, { compact: true })).toBe("$234");
  });

  test("formats compact values >= 10 with one decimal place", () => {
    expect(formatCurrency(42.34, { compact: true })).toBe("$42.3");
  });

  test("formats compact values < 10 with two decimal places", () => {
    expect(formatCurrency(9.5, { compact: true })).toBe("$9.50");
  });

  test("formats non-compact values with locale separators and two decimals", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });

  test("omits currency symbol when showSymbol is false", () => {
    expect(formatCurrency(1234.5, { showSymbol: false })).toBe("1,234.50");
    expect(formatCurrency(1234, { compact: true, showSymbol: false })).toBe("1.2k");
  });
});

describe("formatBudgetDisplay", () => {
  test("returns None for null input", () => {
    expect(formatBudgetDisplay(null)).toBe("None");
  });

  test("delegates formatting to formatCurrency for numeric values", () => {
    expect(formatBudgetDisplay(1234.5)).toBe(formatCurrency(1234.5));
  });
});

describe("isValidCurrencyInput", () => {
  test("returns true for empty input (represents no value)", () => {
    expect(isValidCurrencyInput("")).toBe(true);
    expect(isValidCurrencyInput("   ")).toBe(true);
  });

  test("returns true for valid numeric input", () => {
    expect(isValidCurrencyInput("42.50")).toBe(true);
    expect(isValidCurrencyInput("1.234,56")).toBe(true);
  });

  test("returns false for invalid input", () => {
    expect(isValidCurrencyInput("abc")).toBe(false);
  });
});
