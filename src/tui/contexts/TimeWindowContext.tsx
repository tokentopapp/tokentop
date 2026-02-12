import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

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

export type BudgetType = 'daily' | 'weekly' | 'monthly' | 'none';

export const TIME_WINDOW_BUDGET_TYPE: Record<TimeWindow, BudgetType> = {
  '5m': 'daily',
  '15m': 'daily',
  '1h': 'daily',
  '24h': 'daily',
  '7d': 'weekly',
  '30d': 'monthly',
  'all': 'none',
};

export const BUDGET_TYPE_LABELS: Record<BudgetType, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  none: 'Total',
};

export type BudgetLock = BudgetType | 'sync';

const BUDGET_LOCK_CYCLE: BudgetLock[] = ['sync', 'daily', 'weekly', 'monthly'];

export const BUDGET_LOCK_LABELS: Record<BudgetLock, string> = {
  sync: 'Sync',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  none: 'None',
};

interface TimeWindowContextValue {
  window: TimeWindow;
  setWindow: (w: TimeWindow) => void;
  cycleWindow: () => void;
  windowMs: number | null;
  windowLabel: string;
  getWindowStart: () => number | null;
  budgetType: BudgetType;
  budgetTypeLabel: string;
  budgetLock: BudgetLock;
  setBudgetLock: (lock: BudgetLock) => void;
  cycleBudgetLock: () => void;
  budgetLockLabel: string;
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
  const [budgetLock, setBudgetLock] = useState<BudgetLock>('sync');

  const setWindow = useCallback((w: TimeWindow) => {
    setWindowState(w);
  }, []);

  const cycleWindow = useCallback(() => {
    setWindowState(getNextWindow);
  }, []);

  const cycleBudgetLock = useCallback(() => {
    setBudgetLock(current => {
      const idx = BUDGET_LOCK_CYCLE.indexOf(current);
      const nextIdx = (idx + 1) % BUDGET_LOCK_CYCLE.length;
      return BUDGET_LOCK_CYCLE[nextIdx] as BudgetLock;
    });
  }, []);

  const windowMs = TIME_WINDOW_MS[window];
  const windowLabel = TIME_WINDOW_LABELS[window];
  const budgetType = budgetLock === 'sync' ? TIME_WINDOW_BUDGET_TYPE[window] : budgetLock;
  const budgetTypeLabel = BUDGET_TYPE_LABELS[budgetType];
  const budgetLockLabel = BUDGET_LOCK_LABELS[budgetLock];

  const getWindowStart = useCallback((): number | null => {
    const ms = TIME_WINDOW_MS[window];
    if (ms === null) return null;
    return Date.now() - ms;
  }, [window]);

  const value: TimeWindowContextValue = useMemo(() => ({
    window,
    setWindow,
    cycleWindow,
    windowMs,
    windowLabel,
    getWindowStart,
    budgetType,
    budgetTypeLabel,
    budgetLock,
    setBudgetLock,
    cycleBudgetLock,
    budgetLockLabel,
  }), [window, setWindow, cycleWindow, windowMs, windowLabel, getWindowStart, budgetType, budgetTypeLabel, budgetLock, cycleBudgetLock, budgetLockLabel]);

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
