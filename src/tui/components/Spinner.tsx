import { useEffect, useRef, useState } from "react";
import { animationTick } from "../hooks/useAnimationTick.ts";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL = 80;

interface SpinnerProps {
  color?: string;
}

export function Spinner({ color }: SpinnerProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const lastAdvanceRef = useRef(Date.now());

  useEffect(() => {
    return animationTick.subscribe((now) => {
      if (now - lastAdvanceRef.current >= FRAME_INTERVAL) {
        lastAdvanceRef.current = now;
        setFrameIndex((i) => (i + 1) % SPINNER_FRAMES.length);
      }
    });
  }, []);

  return <text {...(color ? { fg: color } : {})}>{SPINNER_FRAMES[frameIndex]}</text>;
}

export function useSpinner(): string {
  const [frameIndex, setFrameIndex] = useState(0);
  const lastAdvanceRef = useRef(Date.now());

  useEffect(() => {
    return animationTick.subscribe((now) => {
      if (now - lastAdvanceRef.current >= FRAME_INTERVAL) {
        lastAdvanceRef.current = now;
        setFrameIndex((i) => (i + 1) % SPINNER_FRAMES.length);
      }
    });
  }, []);

  return SPINNER_FRAMES[frameIndex] ?? "⠋";
}
