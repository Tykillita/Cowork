import { useEffect } from "react";

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, 3_500);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  return <div id="toast" role="status" className={message ? "is-visible" : ""}>{message}</div>;
}
