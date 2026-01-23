import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface InputContextType {
  isInputFocused: boolean;
  setInputFocused: (focused: boolean) => void;
}

const InputContext = createContext<InputContextType | undefined>(undefined);

export function InputProvider({ children }: { children: ReactNode }) {
  const [isInputFocused, setIsInputFocused] = useState(false);

  const setInputFocused = useCallback((focused: boolean) => {
    setIsInputFocused(focused);
  }, []);

  return (
    <InputContext.Provider value={{ isInputFocused, setInputFocused }}>
      {children}
    </InputContext.Provider>
  );
}

export function useInputFocus() {
  const context = useContext(InputContext);
  if (context === undefined) {
    throw new Error('useInputFocus must be used within an InputProvider');
  }
  return context;
}
