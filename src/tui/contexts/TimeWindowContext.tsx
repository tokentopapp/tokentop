import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type TimeWindow = '5m' | '15m' | '1h' | '24h' | '7d' | '30d' | 'all';

export const TIME_WINDOW_OPTIONS: TimeWindow[] = ['5m', '15m', '1h', '24h', '7d', '30d', 'all'];

export const TIME_WINDOW_LABELS: Record<TimeWindow, string> = {
  '5m': '5 min',
  '15m': '15 min',
  '1h': '1 hour',
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
  'all': 'All time',
};

export const TIME_WINDOW_MS: Record<TimeWindow, number | null> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  'all': null,
};

interface TimeWindowContextValue {
  window: TimeWindow;
  setWindow: (w: TimeWindow) => void;
  cycleWindow: () => void;
  windowMs: number | null;
  windowLabel: string;
  getWindowStart: () => number | null;
}

const TimeWindowContext = createContext<TimeWindowContextValue | null>(null);

interface TimeWindowProviderProps {
  children: ReactNode;
  defaultWindow?: TimeWindow;
}

function getNextWindow(current: TimeWindow): TimeWindow {
  const idx = TIME_WINDOW_OPTIONS.indexOf(current);
  const nextIdx = (idx + 1) % TIME_WINDOW_OPTIONS.length;
  return TIME_WINDOW_OPTIONS[nextIdx] as TimeWindow;
}

export function TimeWindowProvider({ children, defaultWindow = '24h' }: TimeWindowProviderProps) {
  const [window, setWindowState] = useState<TimeWindow>(defaultWindow);

  const setWindow = useCallback((w: TimeWindow) => {
    setWindowState(w);
  }, []);

  const cycleWindow = useCallback(() => {
    setWindowState(getNextWindow);
  }, []);

  const windowMs = TIME_WINDOW_MS[window];
  const windowLabel = TIME_WINDOW_LABELS[window];

  const getWindowStart = useCallback((): number | null => {
    const ms = TIME_WINDOW_MS[window];
    if (ms === null) return null;
    return Date.now() - ms;
  }, [window]);

  const value: TimeWindowContextValue = {
    window,
    setWindow,
    cycleWindow,
    windowMs,
    windowLabel,
    getWindowStart,
  };

  return (
    <TimeWindowContext.Provider value={value}>
      {children}
    </TimeWindowContext.Provider>
  );
}

export function useTimeWindow(): TimeWindowContextValue {
  const context = useContext(TimeWindowContext);
  if (!context) {
    throw new Error('useTimeWindow must be used within TimeWindowProvider');
  }
  return context;
}
