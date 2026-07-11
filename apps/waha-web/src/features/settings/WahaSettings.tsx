import { useState, useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import axios from "axios";

axios.defaults.baseURL = (import.meta as any).env?.VITE_API_URL || "http://localhost:3002";
axios.defaults.withCredentials = true;

export const WahaSettings = () => {
  const [status, setStatus] = useState<"CONNECTED" | "SCAN_QR" | "DISCONNECTED" | "LOADING">("LOADING");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get("/api/whatsapp/status");
      if (res.data.status === "success") {
        setStatus(res.data.session.status);
        if (res.data.session.status !== "SCAN_QR") {
          setQrCode(null);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to fetch status.");
    }
  }, []);

  const fetchQr = useCallback(async () => {
    try {
      const res = await axios.get("/api/whatsapp/qr");
      if (res.data.status === "SCAN_QR") {
        setQrCode(res.data.qrCode); // Already a base64 png Data URL generated locally by backend
        setStatus("SCAN_QR");
      } else if (res.data.status === "CONNECTED") {
        setStatus("CONNECTED");
        setQrCode(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to fetch QR code.");
    }
  }, []);

  // 1. Establish Socket.IO real-time event bindings for status changes
  useEffect(() => {
    fetchStatus();

    const socket = io("http://localhost:3002", {
      withCredentials: true,
      transports: ["websocket", "polling"]
    });

    socket.on("whatsapp:status", (data: any) => {
      setStatus(data.status);
      if (data.status !== "SCAN_QR") {
        setQrCode(null);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchStatus]);

  // 2. Fetch QR code if status transitions to QR Scan
  useEffect(() => {
    if (status === "SCAN_QR" && !qrCode) {
      fetchQr();
    }
  }, [status, qrCode, fetchQr]);

  const handleDisconnect = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await axios.post("/api/whatsapp/disconnect");
      setStatus("DISCONNECTED");
      setQrCode(null);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to disconnect WhatsApp session.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestart = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await axios.post("/api/whatsapp/restart");
      setStatus("LOADING");
      setTimeout(() => {
        fetchStatus();
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to restart WhatsApp session.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">WhatsApp Settings</h1>
        <p className="text-muted text-sm mt-1">Manage connection states and verify WAHA session linkages.</p>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/20 text-danger text-sm rounded-xl p-3 mb-6 font-medium">
          ⚠️ {error}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white border border-line rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-lg font-bold mb-4">Connection Panel</h2>
            <div className="flex items-center justify-between p-4 bg-slate-50 border border-line rounded-xl">
              <div>
                <div className="text-xs text-muted font-semibold uppercase tracking-wider mb-0.5">
                  Current Engine State
                </div>
                <div className="flex items-center gap-2 font-medium">
                  {status === "CONNECTED" && (
                    <>
                      <span className="w-2.5 h-2.5 bg-success rounded-full animate-pulse"></span>
                      <span className="text-success text-sm font-bold">Connected (Real-time Socket Linked)</span>
                    </>
                  )}
                  {status === "SCAN_QR" && (
                    <>
                      <span className="w-2.5 h-2.5 bg-warning rounded-full animate-pulse"></span>
                      <span className="text-warning text-sm font-bold">Scan QR Code Required</span>
                    </>
                  )}
                  {status === "DISCONNECTED" && (
                    <>
                      <span className="w-2.5 h-2.5 bg-danger rounded-full"></span>
                      <span className="text-danger text-sm font-bold">Disconnected</span>
                    </>
                  )}
                  {status === "LOADING" && (
                    <>
                      <span className="w-2.5 h-2.5 bg-accent rounded-full animate-ping"></span>
                      <span className="text-accent text-sm font-bold">Loading...</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleRestart}
                  disabled={actionLoading || status === "LOADING"}
                  className="px-4 py-2 bg-accent text-white hover:bg-accent/90 text-sm font-medium rounded-xl transition-all disabled:opacity-50"
                >
                  Restart Session
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={actionLoading || status === "DISCONNECTED" || status === "LOADING"}
                  className="px-4 py-2 border border-line hover:bg-slate-50 text-ink text-sm font-medium rounded-xl transition-all disabled:opacity-50"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>

          <div className="text-sm text-muted leading-relaxed space-y-2">
            <h3 className="font-bold text-ink">Instructions:</h3>
            <p>1. Open WhatsApp on your mobile device.</p>
            <p>2. Tap on <b>Settings</b> or <b>Menu</b> (three dots) &gt; <b>Linked Devices</b>.</p>
            <p>3. Point your camera at the screen to scan the QR code displayed on the right.</p>
            <p>4. Once linked, the console will automatically sync and refresh to active state.</p>
          </div>
        </div>

        <div className="bg-white border border-line rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center text-center min-h-[300px]">
          {status === "SCAN_QR" && qrCode ? (
            <div className="space-y-4">
              <div className="border border-line rounded-xl p-3 bg-slate-50 inline-block shadow-sm">
                <img
                  src={qrCode} // Renders base64 QR Data URI directly
                  alt="WhatsApp Linking QR Code"
                  className="w-48 h-48 block"
                />
              </div>
              <div className="text-xs font-semibold text-warning">
                Scan code within your mobile WhatsApp app
              </div>
            </div>
          ) : status === "CONNECTED" ? (
            <div className="space-y-3">
              <div className="w-16 h-16 bg-success/10 text-success rounded-full flex items-center justify-center font-bold text-2xl mx-auto mb-2 animate-bounce">
                ✓
              </div>
              <h3 className="font-bold text-lg text-ink">All Linked</h3>
              <p className="text-xs text-muted max-w-[200px]">
                WhatsApp is connected and listening to incoming webhooks.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-500 rounded-full animate-spin mx-auto mb-2"></div>
              <h3 className="font-semibold text-slate-600">Checking Session State</h3>
              <p className="text-xs text-muted max-w-[200px]">
                Waiting for the WAHA API node response...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default WahaSettings;
