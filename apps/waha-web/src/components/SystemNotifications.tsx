import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { X, Info, AlertTriangle, CheckCircle } from "lucide-react";

interface ToastAlert {
  id: string;
  type: "info" | "warning" | "success";
  title: string;
  message: string;
}

export const SystemNotifications: React.FC = () => {
  const [alerts, setAlerts] = useState<ToastAlert[]>([]);

  useEffect(() => {
    // Connect to Socket.IO server
    const socket = io("http://localhost:3000");

    socket.on("system.notification", (data: any) => {
      const newAlert: ToastAlert = {
        id: `alt_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        type: data.type || "info",
        title: data.title || "System Notice",
        message: data.message || ""
      };

      setAlerts(prev => [newAlert, ...prev]);

      // Auto dismiss after 6 seconds
      setTimeout(() => {
        setAlerts(prev => prev.filter(a => a.id !== newAlert.id));
      }, 6000);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="fixed top-6 right-6 z-[100] max-w-sm w-full space-y-3 pointer-events-none select-none text-left">
      {alerts.map((alert) => {
        const isSuccess = alert.type === "success";
        const isWarning = alert.type === "warning";

        return (
          <div
            key={alert.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 bg-white border rounded-2xl shadow-xl border-line animate-slide-in transition-all`}
          >
            {isSuccess ? (
              <CheckCircle className="w-5 h-5 text-success shrink-0 mt-0.5" />
            ) : isWarning ? (
              <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            ) : (
              <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            )}

            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-xs text-ink mb-0.5">{alert.title}</h4>
              <p className="text-[11px] text-muted leading-relaxed">{alert.message}</p>
            </div>

            <button
              onClick={() => dismissAlert(alert.id)}
              className="p-0.5 text-muted hover:text-ink hover:bg-slate-100 rounded-lg shrink-0 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
