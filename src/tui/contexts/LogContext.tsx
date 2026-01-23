import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
  source?: string;
}

interface LogContextValue {
  logs: LogEntry[];
  isConsoleOpen: boolean;
  toggleConsole: () => void;
  openConsole: () => void;
  closeConsole: () => void;
  log: (level: LogLevel, message: string, data?: Record<string, unknown>, source?: string) => void;
  debug: (message: string, data?: Record<string, unknown>, source?: string) => void;
  info: (message: string, data?: Record<string, unknown>, source?: string) => void;
  warn: (message: string, data?: Record<string, unknown>, source?: string) => void;
  error: (message: string, data?: Record<string, unknown>, source?: string) => void;
  clearLogs: () => void;
  exportLogs: () => string;
}

const LogContext = createContext<LogContextValue | null>(null);

let logIdCounter = 0;
const MAX_LOGS = 500;

interface LogProviderProps {
  children: ReactNode;
  debugEnabled?: boolean;
}

export function LogProvider({ children, debugEnabled = true }: LogProviderProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);

  const addLog = useCallback((level: LogLevel, message: string, data?: Record<string, unknown>, source?: string) => {
    if (level === 'debug' && !debugEnabled) return;

    const entry: LogEntry = {
      id: ++logIdCounter,
      level,
      message,
      timestamp: Date.now(),
      ...(data !== undefined ? { data } : {}),
      ...(source !== undefined ? { source } : {}),
    };

    setLogs((prev) => {
      const next = [...prev, entry];
      if (next.length > MAX_LOGS) {
        return next.slice(-MAX_LOGS);
      }
      return next;
    });
  }, [debugEnabled]);

  const log = useCallback((level: LogLevel, message: string, data?: Record<string, unknown>, source?: string) => {
    addLog(level, message, data, source);
  }, [addLog]);

  const debug = useCallback((message: string, data?: Record<string, unknown>, source?: string) => {
    addLog('debug', message, data, source);
  }, [addLog]);

  const info = useCallback((message: string, data?: Record<string, unknown>, source?: string) => {
    addLog('info', message, data, source);
  }, [addLog]);

  const warn = useCallback((message: string, data?: Record<string, unknown>, source?: string) => {
    addLog('warn', message, data, source);
  }, [addLog]);

  const error = useCallback((message: string, data?: Record<string, unknown>, source?: string) => {
    addLog('error', message, data, source);
  }, [addLog]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const toggleConsole = useCallback(() => {
    setIsConsoleOpen((prev) => !prev);
  }, []);

  const openConsole = useCallback(() => {
    setIsConsoleOpen(true);
  }, []);

  const closeConsole = useCallback(() => {
    setIsConsoleOpen(false);
  }, []);

  const exportLogs = useCallback(() => {
    const lines = logs.map((entry) => {
      const time = new Date(entry.timestamp).toISOString();
      const src = entry.source ? `[${entry.source}]` : '';
      const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
      return `${time} ${entry.level.toUpperCase().padEnd(5)} ${src} ${entry.message}${dataStr}`;
    });
    return lines.join('\n');
  }, [logs]);

  const value: LogContextValue = {
    logs,
    isConsoleOpen,
    toggleConsole,
    openConsole,
    closeConsole,
    log,
    debug,
    info,
    warn,
    error,
    clearLogs,
    exportLogs,
  };

  return (
    <LogContext.Provider value={value}>
      {children}
    </LogContext.Provider>
  );
}

export function useLogs(): LogContextValue {
  const context = useContext(LogContext);
  if (!context) {
    throw new Error('useLogs must be used within LogProvider');
  }
  return context;
}

export function useLogger(source: string) {
  const { log, debug, info, warn, error } = useLogs();

  return {
    log: (level: LogLevel, message: string, data?: Record<string, unknown>) => log(level, message, data, source),
    debug: (message: string, data?: Record<string, unknown>) => debug(message, data, source),
    info: (message: string, data?: Record<string, unknown>) => info(message, data, source),
    warn: (message: string, data?: Record<string, unknown>) => warn(message, data, source),
    error: (message: string, data?: Record<string, unknown>) => error(message, data, source),
  };
}
