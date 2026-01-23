import { useState, useEffect } from 'react';
import { useColors } from '../contexts/ThemeContext.tsx';

interface ToastProps {
  message: string;
  duration?: number;
  onDismiss: () => void;
  type?: 'info' | 'success' | 'warning' | 'error';
}

export function Toast({ message, duration = 2000, onDismiss, type = 'success' }: ToastProps) {
  const colors = useColors();

  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  const accentColor = {
    info: colors.info,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
  }[type];

  return (
    <box
      position="absolute"
      top={3}
      right={2}
      flexDirection="row"
      backgroundColor={colors.foreground}
      borderStyle="rounded"
      borderColor={colors.border}
    >
      <box width={1} backgroundColor={accentColor} />
      <box paddingLeft={1} paddingRight={2}>
        <text fg={colors.text}>{message}</text>
      </box>
    </box>
  );
}

interface ToastState {
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const dismissToast = () => {
    setToast(null);
  };

  return { toast, showToast, dismissToast };
}
