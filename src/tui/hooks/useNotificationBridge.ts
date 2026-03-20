import type { NotificationEvent } from "@tokentop/plugin-sdk";
import { useEffect } from "react";
import { notificationBus } from "@/plugins/notification-bus.ts";
import { useToastContext } from "../contexts/ToastContext.tsx";

function severityToToastType(
  severity: NotificationEvent["severity"],
): "info" | "warning" | "error" {
  switch (severity) {
    case "critical":
      return "error";
    case "warning":
      return "warning";
    default:
      return "info";
  }
}

export function useNotificationBridge(): void {
  const { showToast } = useToastContext();

  useEffect(() => {
    const handler = (event: NotificationEvent) => {
      showToast(event.title, severityToToastType(event.severity));
    };
    notificationBus.setToastHandler(handler);
    return () => notificationBus.setToastHandler(null);
  }, [showToast]);
}
