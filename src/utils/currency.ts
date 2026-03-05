/**
 * Parse a currency input string that may use either . or , as decimal separator.
 * Handles US format (1,234.56) and European format (1.234,56).
 */
export function parseCurrencyInput(input: string): number | null {
  if (!input || input.trim() === "") {
    return null;
  }

  let normalized = input.trim().replace(/[$€£]/g, "").replace(/\s/g, "");

  const hasComma = normalized.includes(",");
  const hasPeriod = normalized.includes(".");

  if (hasComma && hasPeriod) {
    const lastComma = normalized.lastIndexOf(",");
    const lastPeriod = normalized.lastIndexOf(".");

    if (lastComma > lastPeriod) {
      // European: 1.234,56 → remove periods, comma becomes decimal
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      // US: 1,234.56 → remove commas
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = normalized.split(",");
    // 3 digits after comma = thousands separator (1,234), otherwise decimal (10,50)
    const afterComma = parts[1]?.length ?? 0;
    const beforeComma = parts[0]?.length ?? 0;
    if (parts.length === 2 && afterComma === 3 && beforeComma > 0) {
      normalized = normalized.replace(",", "");
    } else {
      normalized = normalized.replace(",", ".");
    }
  }

  const parsed = parseFloat(normalized);

  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

export function formatCurrency(
  value: number | null,
  options?: {
    compact?: boolean;
    showSymbol?: boolean;
  },
): string {
  if (value === null) {
    return "None";
  }

  const { compact = false, showSymbol = true } = options ?? {};
  const symbol = showSymbol ? "$" : "";

  if (compact) {
    if (value >= 1000) return `${symbol}${(value / 1000).toFixed(1)}k`;
    if (value >= 100) return `${symbol}${Math.round(value)}`;
    if (value >= 10) return `${symbol}${value.toFixed(1)}`;
    return `${symbol}${value.toFixed(2)}`;
  }

  return `${symbol}${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatBudgetDisplay(value: number | null): string {
  if (value === null) {
    return "None";
  }
  return formatCurrency(value);
}

export function isValidCurrencyInput(input: string): boolean {
  if (input.trim() === "") return true;
  return parseCurrencyInput(input) !== null;
}
