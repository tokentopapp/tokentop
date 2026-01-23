import { useState, useEffect } from 'react';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const FRAME_INTERVAL = 80;

interface SpinnerProps {
  color?: string;
}

export function Spinner({ color }: SpinnerProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((i) => (i + 1) % SPINNER_FRAMES.length);
    }, FRAME_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return <text {...(color ? { fg: color } : {})}>{SPINNER_FRAMES[frameIndex]}</text>;
}

export function useSpinner(): string {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((i) => (i + 1) % SPINNER_FRAMES.length);
    }, FRAME_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return SPINNER_FRAMES[frameIndex] ?? '⠋';
}
