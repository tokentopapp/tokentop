import { RGBA } from "@opentui/core";
import type { NotificationEvent } from "@tokentop/plugin-sdk";
import { useEffect, useState } from "react";
import { notificationBus } from "@/plugins/notification-bus.ts";
import { Z_INDEX } from "./ModalBackdrop.tsx";

const FLASH_DURATION_MS = 150;

const FLASH_COLORS: Record<NotificationEvent["severity"], RGBA> = {
  critical: RGBA.fromValues(1.0, 0.2, 0.2, 0.35),
  warning: RGBA.fromValues(1.0, 0.7, 0.1, 0.3),
  info: RGBA.fromValues(0.3, 0.6, 1.0, 0.25),
};

export function NotificationFlash() {
  const [flash, setFlash] = useState<NotificationEvent["severity"] | null>(null);

  useEffect(() => {
    notificationBus.setFlashHandler((severity) => setFlash(severity));
    return () => notificationBus.setFlashHandler(null);
  }, []);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), FLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  if (!flash) return null;

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      backgroundColor={FLASH_COLORS[flash]}
      zIndex={Z_INDEX.TOAST + 1}
    />
  );
}
