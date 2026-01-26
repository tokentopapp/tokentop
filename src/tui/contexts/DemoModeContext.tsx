import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DemoSimulator, type DemoPreset, type DemoSimulatorOptions } from '@/demo/simulator.ts';

interface DemoModeContextValue {
  demoMode: boolean;
  simulator: DemoSimulator | null;
  seed: number | null;
  preset: DemoPreset | null;
}

const DemoModeContext = createContext<DemoModeContextValue>({
  demoMode: false,
  simulator: null,
  seed: null,
  preset: null,
});

interface DemoModeProviderProps {
  demoMode: boolean;
  demoSeed?: number;
  demoPreset?: DemoPreset;
  children: ReactNode;
}

function buildSimulatorOptions(seed: number | undefined, preset: DemoPreset | undefined): DemoSimulatorOptions {
  if (seed !== undefined && preset !== undefined) {
    return { seed, preset };
  }
  if (seed !== undefined) {
    return { seed };
  }
  if (preset !== undefined) {
    return { preset };
  }
  return {};
}

export function DemoModeProvider({ demoMode, demoSeed, demoPreset, children }: DemoModeProviderProps) {
  const simulator = useMemo(() => {
    if (!demoMode) return null;
    return new DemoSimulator(buildSimulatorOptions(demoSeed, demoPreset));
  }, [demoMode, demoSeed, demoPreset]);

  const value = useMemo<DemoModeContextValue>(() => ({
    demoMode,
    simulator,
    seed: simulator?.getSeed() ?? null,
    preset: simulator?.getPreset() ?? null,
  }), [demoMode, simulator]);

  return (
    <DemoModeContext.Provider value={value}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode(): DemoModeContextValue {
  return useContext(DemoModeContext);
}
