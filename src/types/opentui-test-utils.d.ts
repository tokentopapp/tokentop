declare module '@opentui/react/test-utils' {
  import type { TestRendererOptions } from '@opentui/core/testing';
  import type { ReactNode } from 'react';

  export function testRender(
    node: ReactNode,
    testRendererOptions: TestRendererOptions
  ): Promise<{
    renderer: import('@opentui/core/testing').TestRenderer;
    mockInput: import('@opentui/core/testing').MockInput;
    mockMouse: import('@opentui/core/testing').MockMouse;
    renderOnce: () => Promise<void>;
    captureCharFrame: () => string;
    resize: (width: number, height: number) => void;
  }>;
}

export {};
