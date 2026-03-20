import type { NotificationEvent } from "@tokentop/plugin-sdk";
import { useEffect, useRef, useState } from "react";
import { notificationBus } from "@/plugins/notification-bus.ts";
import { useColors } from "../contexts/ThemeContext.tsx";
import { animationTick } from "../hooks/useAnimationTick.ts";
import { Z_INDEX } from "./ModalBackdrop.tsx";

/**
 * Notification flash as an animated border glow.
 *
 * On notification:
 *   0–15%   Overbright burst → alert color  (double border)
 *   15–40%  Alert color fading              (double border)
 *   40–100% Continuing fade → background    (single border, then unmount)
 *
 * Uses the global 30 Hz animation tick for smooth interpolation.
 */

const GLOW_DURATION_MS = 500;

/** Bright, saturated alert colors — vivid regardless of theme */
const GLOW_COLORS: Record<NotificationEvent["severity"], string> = {
  critical: "#ff3333",
  warning: "#ffaa22",
  info: "#3399ff",
};

// ── Color math ──────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Linearly interpolate two hex colors. t=0 → from, t=1 → to. */
function lerpColor(from: string, to: string, t: number): string {
  const [r1, g1, b1] = parseHex(from);
  const [r2, g2, b2] = parseHex(to);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Brighten a color by a factor (>1 = brighter). Clamps at 255. */
function brighten(hex: string, factor = 1.4): string {
  const [r, g, b] = parseHex(hex);
  return toHex(r * factor, g * factor, b * factor);
}

/** easeOutCubic — fast attack, gentle tail */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

// ── Component ───────────────────────────────────────────────

export function NotificationFlash() {
  const colors = useColors();
  const [flash, setFlash] = useState<{
    severity: NotificationEvent["severity"];
    startTime: number;
  } | null>(null);
  const [borderColor, setBorderColor] = useState<string | null>(null);
  const [borderStyle, setBorderStyle] = useState<"double" | "single">("double");
  const unsubRef = useRef<(() => void) | null>(null);

  // Register flash handler on the notification bus
  useEffect(() => {
    notificationBus.setFlashHandler((severity) => {
      setFlash({ severity, startTime: Date.now() });
    });
    return () => notificationBus.setFlashHandler(null);
  }, []);

  // Drive the animation via the global 30 Hz tick
  useEffect(() => {
    if (!flash) {
      setBorderColor(null);
      return;
    }

    unsubRef.current?.();

    const alertColor = GLOW_COLORS[flash.severity];
    const brightColor = brighten(alertColor);
    const bgColor = colors.background;

    unsubRef.current = animationTick.subscribe((now) => {
      const elapsed = now - flash.startTime;
      const progress = Math.min(elapsed / GLOW_DURATION_MS, 1);

      let currentColor: string;
      if (progress < 0.15) {
        // Burst phase: overbright → alert color
        currentColor = lerpColor(brightColor, alertColor, progress / 0.15);
      } else {
        // Fade phase: alert → background (eased for gentle tail)
        const fadeT = (progress - 0.15) / 0.85;
        currentColor = lerpColor(alertColor, bgColor, easeOutCubic(fadeT));
      }

      setBorderColor(currentColor);
      setBorderStyle(progress < 0.4 ? "double" : "single");

      if (progress >= 1) {
        unsubRef.current?.();
        unsubRef.current = null;
        setFlash(null);
        setBorderColor(null);
      }
    });

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [flash, colors.background]);

  if (!borderColor) return null;

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      zIndex={Z_INDEX.TOAST + 1}
      border
      borderStyle={borderStyle}
      borderColor={borderColor}
    />
  );
}
