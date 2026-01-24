import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useKeyboard } from '@opentui/react';
import type { ScrollBoxRenderable, BoxRenderable, InputRenderable } from '@opentui/core';
import { useColors } from '../contexts/ThemeContext.tsx';
import { usePlugins, type ProviderState } from '../contexts/PluginContext.tsx';
import { useInputFocus } from '../contexts/InputContext.tsx';
import { ProviderCard } from '../components/ProviderCard.tsx';
import { GhostProviderCard } from '../components/GhostProviderCard.tsx';
import { ProvidersList } from '../components/ProvidersList.tsx';

type SortMode = 'name' | 'usage' | 'status';
type ViewMode = 'cards' | 'list';

export function Dashboard() {
  const colors = useColors();
  const { providers, isInitialized, refreshAllProviders } = usePlugins();
  const { setInputFocused } = useInputFocus();
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  
  const [filterQuery, setFilterQuery] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('status');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showUnconfigured, setShowUnconfigured] = useState(true);

  // Refs to avoid stale closures in useKeyboard
  const isFilteringRef = useRef(isFiltering);
  
  useEffect(() => {
    isFilteringRef.current = isFiltering;
  }, [isFiltering]);

  useEffect(() => {
    setInputFocused(isFiltering);
    return () => setInputFocused(false);
  }, [isFiltering, setInputFocused]);

  const scrollBoxRef = useRef<ScrollBoxRenderable>(null);
  const containerRef = useRef<BoxRenderable>(null);
  const cardRefs = useRef<(BoxRenderable | null)[]>([]);
  const inputRef = useRef<InputRenderable>(null);

  useEffect(() => {
    if (isInitialized) {
      refreshAllProviders();
    }
  }, [isInitialized]);

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

  const providerList = Array.from(providers.values());
  
  const filteredAndSortedProviders = useMemo(() => {
    let result = providerList.filter((p) => p.configured);

    if (filterQuery) {
      const query = filterQuery.toLowerCase();
      result = result.filter(p => p.plugin.name.toLowerCase().includes(query));
    }

    result.sort((a, b) => {
      switch (sortMode) {
        case 'name':
          return a.plugin.name.localeCompare(b.plugin.name);
        case 'usage':
          return getMaxUsage(b) - getMaxUsage(a);
        case 'status': {
          if (a.usage?.limitReached !== b.usage?.limitReached) {
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
  }, [providerList, filterQuery, sortMode, getMaxUsage]);

  const configured = filteredAndSortedProviders;
  const unconfigured = useMemo(() => 
    providerList.filter((p) => !p.configured),
    [providerList]
  );

  const cycleFocus = useCallback((direction: 1 | -1) => {
    const total = configured.length + (showUnconfigured ? unconfigured.length : 0);
    if (total === 0) return;

    setFocusedIndex((current) => {
      if (current === null) {
        return direction === 1 ? 0 : total - 1;
      }
      const next = current + direction;
      if (next < 0) return null;
      if (next >= total) return null;
      return next;
    });
  }, [configured.length, unconfigured.length, showUnconfigured]);

  useKeyboard((key) => {
    if (isFilteringRef.current) {
      if (key.name === 'escape') {
        setIsFiltering(false);
        setFilterQuery('');
        return;
      }
      if (key.name === 'enter' || key.name === 'return') {
        setIsFiltering(false);
        return;
      }
      return; 
    }

    if (key.name === 'down' || key.name === 'j') {
      cycleFocus(1);
    } else if (key.name === 'up' || key.name === 'k') {
      cycleFocus(-1);
    } else if (key.name === 'tab' && !key.shift) {
      cycleFocus(1);
    } else if (key.name === 'tab' && key.shift) {
      cycleFocus(-1);
    } else if (key.name === 'escape') {
      if (focusedIndex !== null) {
        setFocusedIndex(null);
      } else if (filterQuery) {
        setFilterQuery('');
      }
    } else if (key.name === '/' || key.name === 'f') {
      setIsFiltering(true);
    } else if (key.name === 's') {
      setSortMode(current => {
        if (current === 'status') return 'usage';
        if (current === 'usage') return 'name';
        return 'status';
      });
    } else if (key.name === 'v') {
      setViewMode(current => current === 'cards' ? 'list' : 'cards');
    } else if (key.name === 'u') {
      setShowUnconfigured(current => !current);
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
    <box flexDirection="column" flexGrow={1} padding={1} gap={1}>
      <box flexDirection="row" gap={2} alignItems="center" height={1} justifyContent="space-between">
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
              {filterQuery ? `Filter: "${filterQuery}"` : '/ filter'}
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
            <span fg={colors.primary}>{viewMode === 'cards' ? 'Cards' : 'List'}</span>
          </text>
        </box>

        <text fg={colors.textMuted}>
          {totalConfigured} configured{totalUnconfigured > 0 ? `, ${totalUnconfigured} unconfigured` : ''}
        </text>
      </box>

      {viewMode === 'list' ? (
        <ProvidersList
          providers={configured}
          selectedIndex={focusedIndex}
          onSelect={setFocusedIndex}
        />
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
                    trackOptions: {
                      foregroundColor: colors.textSubtle,
                    },
                  },
                }}
              >
                <box 
                  ref={containerRef}
                  flexDirection="row" 
                  flexWrap="wrap" 
                  gap={1}
                >
                  {configured.map((state, index) => (
                    <ProviderCard
                      ref={(el) => { cardRefs.current[index] = el; }}
                      key={state.plugin.id}
                      name={state.plugin.name}
                      configured={state.configured}
                      loading={state.loading}
                      usage={state.usage}
                      color={state.plugin.meta?.color}
                      focused={focusedIndex === index && !isFiltering}
                      onFocus={() => setFocusedIndex(index)}
                    />
                  ))}
                  
                  {showUnconfigured && unconfigured.map((state, index) => (
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
                {filterQuery ? 'No matching providers found' : 'No configured providers'}
              </text>
            </box>
          )}
        </>
      )}

      <box flexDirection="row" paddingLeft={1}>
        <text fg={colors.textSubtle}>
          {isFiltering ? 'Type to filter  Esc cancel  Enter apply' :
           '↑↓ navigate  / filter  s sort  v toggle view  u toggle unconfigured'}
        </text>
      </box>
    </box>
  );
}
