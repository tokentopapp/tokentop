import type { BoxRenderable, InputRenderable, ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GhostProviderCard } from "../components/GhostProviderCard.tsx";
import { ProviderAggregateStrip } from "../components/ProviderAggregateStrip.tsx";
import { ProviderCard } from "../components/ProviderCard.tsx";
import { ProvidersList } from "../components/ProvidersList.tsx";
import { useAgentSessions } from "../contexts/AgentSessionContext.tsx";
import { useInputFocus } from "../contexts/InputContext.tsx";
import { type ProviderState, usePlugins } from "../contexts/PluginContext.tsx";
import { useColors } from "../contexts/ThemeContext.tsx";
import { useSessionEnrichedProviders } from "../hooks/useSessionEnrichedProviders.ts";

type SortMode = "name" | "usage" | "status";
type ViewMode = "cards" | "list";

export function Dashboard() {
  const colors = useColors();
  const { width: termWidth } = useTerminalDimensions();
  const {
    providers: rawProviders,
    isInitialized,
    refreshAllProviders,
    refreshProvider,
  } = usePlugins();
  const { sessions } = useAgentSessions();
  const providers = useSessionEnrichedProviders(rawProviders, sessions);
  const { setInputFocused } = useInputFocus();
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const [filterQuery, setFilterQuery] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("status");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showUnconfigured, setShowUnconfigured] = useState(true);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [atRiskFocus, setAtRiskFocus] = useState(false);

  const isFilteringRef = useRef(isFiltering);
  const expandedIndexRef = useRef(expandedIndex);
  const focusedIndexRef = useRef(focusedIndex);
  const selectedProviderIdRef = useRef<string | null>(null);

  useEffect(() => {
    isFilteringRef.current = isFiltering;
  }, [isFiltering]);
  useEffect(() => {
    expandedIndexRef.current = expandedIndex;
  }, [expandedIndex]);
  useEffect(() => {
    focusedIndexRef.current = focusedIndex;
  }, [focusedIndex]);
  useEffect(() => {
    setInputFocused(isFiltering);
    return () => setInputFocused(false);
  }, [isFiltering, setInputFocused]);

  const scrollBoxRef = useRef<ScrollBoxRenderable>(null);
  const containerRef = useRef<BoxRenderable>(null);
  const cardRefs = useRef<(BoxRenderable | null)[]>([]);
  const inputRef = useRef<InputRenderable>(null);

  const getMaxUsage = useCallback((state: ProviderState) => {
    if (!state.usage?.limits) return 0;

    const items = state.usage.limits.items ?? [];
    if (items.length > 0) {
      return Math.max(...items.map((item) => item.usedPercent ?? 0));
    }

    const primary = state.usage.limits.primary?.usedPercent || 0;
    const secondary = state.usage.limits.secondary?.usedPercent || 0;

    return Math.max(primary, secondary);
  }, []);

  const providerList = useMemo(() => Array.from(providers.values()), [providers]);

  const filteredAndSortedProviders = useMemo(() => {
    let result = providerList.filter((p) => p.configured);

    if (atRiskFocus) {
      result = result.filter((p) => {
        if (p.usage?.error) return true;
        if (p.usage?.limitReached) return true;
        const maxUsage = getMaxUsage(p);
        return maxUsage >= 80;
      });
    }

    if (filterQuery) {
      const query = filterQuery.toLowerCase();
      result = result.filter((p) => p.plugin.name.toLowerCase().includes(query));
    }

    result.sort((a, b) => {
      switch (sortMode) {
        case "name":
          return a.plugin.name.localeCompare(b.plugin.name);
        case "usage":
          return getMaxUsage(b) - getMaxUsage(a);
        case "status": {
          if (!!a.usage?.limitReached !== !!b.usage?.limitReached) {
            return a.usage?.limitReached ? -1 : 1;
          }
          if (!!a.usage?.error !== !!b.usage?.error) {
            return a.usage?.error ? -1 : 1;
          }
          const usageDiff = getMaxUsage(b) - getMaxUsage(a);
          if (Math.abs(usageDiff) > 0.01) return usageDiff;
          return a.plugin.name.localeCompare(b.plugin.name);
        }
        default:
          return 0;
      }
    });

    return result;
  }, [providerList, filterQuery, sortMode, getMaxUsage, atRiskFocus]);

  const configured = filteredAndSortedProviders;
  const unconfigured = useMemo(() => providerList.filter((p) => !p.configured), [providerList]);

  // Stabilize selection across re-sorts: track selected provider by ID
  // so the highlight follows the same provider when live data causes reordering.
  useLayoutEffect(() => {
    if (focusedIndex === null) return;

    if (selectedProviderIdRef.current && focusedIndex < configured.length) {
      // Early return if current index already points to tracked provider
      // (prevents infinite re-render loop when providerList creates new array refs)
      if (configured[focusedIndex]?.plugin.id === selectedProviderIdRef.current) return;

      const newIndex = configured.findIndex((p) => p.plugin.id === selectedProviderIdRef.current);
      if (newIndex !== -1) {
        if (newIndex !== focusedIndex) setFocusedIndex(newIndex);
        return;
      }
      selectedProviderIdRef.current = null;
    }

    const includeUnconfigured = viewMode === "cards" && showUnconfigured;
    const total = configured.length + (includeUnconfigured ? unconfigured.length : 0);
    if (total === 0) {
      setFocusedIndex(null);
    } else if (focusedIndex >= total) {
      setFocusedIndex(total - 1);
    }
  }, [filteredAndSortedProviders, unconfigured.length, showUnconfigured, viewMode]);

  // Record which provider the user selected
  useEffect(() => {
    if (focusedIndex !== null && focusedIndex < configured.length) {
      const provider = configured[focusedIndex];
      if (provider) selectedProviderIdRef.current = provider.plugin.id;
    } else {
      selectedProviderIdRef.current = null;
    }
  }, [focusedIndex, configured]);

  const cycleFocus = useCallback(
    (direction: 1 | -1) => {
      const includeUnconfigured = viewMode === "cards" && showUnconfigured;
      const total = configured.length + (includeUnconfigured ? unconfigured.length : 0);
      if (total === 0) return;

      setFocusedIndex((current) => {
        if (current === null) {
          return direction === 1 ? 0 : total - 1;
        }
        const next = current + direction;
        if (next < 0) return total - 1;
        if (next >= total) return 0;
        return next;
      });
    },
    [configured.length, unconfigured.length, showUnconfigured, viewMode],
  );

  const toggleExpanded = useCallback(() => {
    const current = focusedIndexRef.current;
    if (current === null) return;
    setExpandedIndex((prev) => (prev === current ? null : current));
  }, []);

  const refreshSelected = useCallback(() => {
    const idx = focusedIndexRef.current;
    if (idx === null || idx >= configured.length) return;
    const provider = configured[idx];
    if (provider) {
      refreshProvider(provider.plugin.id);
    }
  }, [configured, refreshProvider]);

  useKeyboard((key) => {
    if (isFilteringRef.current) {
      if (key.name === "escape") {
        setIsFiltering(false);
        setFilterQuery("");
        return;
      }
      if (key.name === "enter" || key.name === "return") {
        setIsFiltering(false);
        return;
      }
      return;
    }

    if (key.name === "down" || key.name === "j") {
      cycleFocus(1);
    } else if (key.name === "up" || key.name === "k") {
      cycleFocus(-1);
    } else if (key.name === "tab" && !key.shift) {
      cycleFocus(1);
    } else if (key.name === "tab" && key.shift) {
      cycleFocus(-1);
    } else if (key.name === "escape") {
      if (expandedIndexRef.current !== null) {
        setExpandedIndex(null);
      } else if (focusedIndex !== null) {
        setFocusedIndex(null);
      } else if (filterQuery) {
        setFilterQuery("");
      }
    } else if (key.name === "enter" || key.name === "return") {
      toggleExpanded();
    } else if (key.name === "/" || key.name === "f") {
      setIsFiltering(true);
    } else if (key.name === "s") {
      setSortMode((current) => {
        if (current === "status") return "usage";
        if (current === "usage") return "name";
        return "status";
      });
    } else if (key.name === "v") {
      setViewMode((current) => (current === "cards" ? "list" : "cards"));
    } else if (key.name === "u") {
      setShowUnconfigured((current) => !current);
    } else if (key.name === "x") {
      setAtRiskFocus((current) => !current);
    } else if (key.sequence === "R") {
      refreshAllProviders();
    } else if (key.sequence === "r" && focusedIndex !== null) {
      refreshSelected();
    }
  });

  if (!isInitialized) {
    return (
      <box flexGrow={1} justifyContent="center" alignItems="center">
        <text fg={colors.textMuted}>Initializing plugins...</text>
      </box>
    );
  }

  const totalConfigured = configured.length;
  const totalUnconfigured = unconfigured.length;

  return (
    <box flexDirection="column" flexGrow={1} padding={1} gap={0}>
      <ProviderAggregateStrip
        providers={atRiskFocus ? configured : providerList.filter((p) => p.configured)}
      />

      <box
        flexDirection="row"
        gap={2}
        alignItems="center"
        height={1}
        justifyContent="space-between"
        paddingX={1}
      >
        <box flexDirection="row" gap={2} alignItems="center">
          {isFiltering ? (
            <box flexDirection="row" gap={1} alignItems="center">
              <text fg={colors.primary}>Filter:</text>
              <input
                ref={inputRef}
                value={filterQuery}
                onInput={(value: string) => setFilterQuery(value)}
                focused={isFiltering}
                width={20}
                backgroundColor={colors.background}
                textColor={colors.text}
                cursorColor={colors.primary}
              />
              <text fg={colors.textSubtle}>(esc to clear)</text>
            </box>
          ) : (
            <text fg={colors.textSubtle}>
              {filterQuery ? `Filter: "${filterQuery}"` : "/ filter"}
            </text>
          )}

          <text fg={colors.textSubtle}>|</text>

          <text>
            <span fg={colors.textSubtle}>Sort: </span>
            <span fg={colors.primary}>{sortMode.toUpperCase()}</span>
          </text>

          <text fg={colors.textSubtle}>|</text>

          <text>
            <span fg={colors.textSubtle}>View: </span>
            <span fg={colors.primary}>{viewMode === "cards" ? "Cards" : "Console"}</span>
          </text>

          {atRiskFocus && (
            <>
              <text fg={colors.textSubtle}>|</text>
              <text fg={colors.warning}>AT-RISK</text>
            </>
          )}
        </box>

        <text fg={colors.textMuted}>
          {totalConfigured} configured
          {totalUnconfigured > 0 ? `, ${totalUnconfigured} unconfigured` : ""}
        </text>
      </box>

      {viewMode === "list" ? (
        <box flexDirection="column" flexGrow={1}>
          <ProvidersList
            providers={configured}
            selectedIndex={focusedIndex}
            onSelect={setFocusedIndex}
            expandedIndex={expandedIndex}
          />
        </box>
      ) : (
        <>
          {configured.length > 0 ? (
            <box flexDirection="column" gap={1} flexGrow={1}>
              <scrollbox
                ref={scrollBoxRef}
                flexGrow={1}
                focused={!isFiltering}
                style={{
                  scrollbarOptions: {
                    visible: false,
                  },
                }}
              >
                <box ref={containerRef} flexDirection="row" flexWrap="wrap" gap={1}>
                  {configured.map((state, index) => (
                    <ProviderCard
                      ref={(el) => {
                        cardRefs.current[index] = el;
                      }}
                      key={state.plugin.id}
                      name={state.plugin.name}
                      configured={state.configured}
                      loading={state.loading}
                      usage={state.usage}
                      color={state.plugin.meta?.brandColor}
                      focused={focusedIndex === index && !isFiltering}
                      onFocus={() => setFocusedIndex(index)}
                    />
                  ))}

                  {showUnconfigured &&
                    unconfigured.map((state, index) => (
                      <GhostProviderCard
                        key={state.plugin.id}
                        name={state.plugin.name}
                        focused={focusedIndex === configured.length + index && !isFiltering}
                        onFocus={() => setFocusedIndex(configured.length + index)}
                      />
                    ))}
                </box>
              </scrollbox>
            </box>
          ) : (
            <box flexGrow={1} justifyContent="center" alignItems="center">
              <text fg={colors.textMuted}>
                {filterQuery ? "No matching providers found" : "No configured providers"}
              </text>
            </box>
          )}
        </>
      )}

      <box flexDirection="row" paddingLeft={1} height={1}>
        <text fg={colors.textSubtle} height={1}>
          {isFiltering
            ? "Type to filter  Esc cancel  Enter apply"
            : termWidth < 90
              ? "↑↓ nav  Enter detail  / filter  s sort  v view  u unconf  x risk"
              : "↑↓ navigate  Enter detail  / filter  s sort  v view  u unconfigured  x at-risk  R refresh"}
        </text>
      </box>
    </box>
  );
}
