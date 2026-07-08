import React, { useState } from "react";
import axios from "axios";
import { AlertTriangle, Loader2, X, CheckCircle } from "lucide-react";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: string | null;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, conversationId }) => {
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comments.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Gather client-side diagnostics details
      const payload = {
        page: document.title || "WAHA Control Center",
        comments,
        browser: navigator.userAgent,
        browserVersion: navigator.appVersion,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        currentRoute: window.location.pathname,
        conversationId: conversationId || null,
        workerStatus: "ACTIVE",
        queueDepth: 0
      };

      await axios.post("/api/dev/feedback", payload);
      setSuccess(true);
      setComments("");
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to submit report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-white border border-line rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col text-left">
        {/* Header */}
        <div className="px-6 py-4 border-b border-line flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-sm text-ink flex items-center gap-1.5">
            <AlertTriangle className="w-4.5 h-4.5 text-warning shrink-0" /> Report System Issue
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg transition-all text-muted hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        {success ? (
          <div className="p-8 text-center flex flex-col items-center justify-center space-y-2">
            <CheckCircle className="w-12 h-12 text-success animate-bounce" />
            <h4 className="font-bold text-sm text-ink">Feedback Logged!</h4>
            <p className="text-xs text-muted">Diagnostics telemetry records have been saved successfully.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-danger/10 border border-danger/20 text-danger text-xs font-semibold rounded-xl">
                ⚠️ {error}
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider">Describe the problem</label>
              <textarea
                rows={4}
                required
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="What occurred? (e.g. queue stopped, message delays, audio playback fail...)"
                className="w-full p-3 bg-slate-50 border border-line rounded-xl text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent leading-relaxed"
              />
            </div>

            {/* Diagnostic metadata tags */}
            <div className="p-3 bg-slate-50 border border-line rounded-xl space-y-1.5 text-[10px] text-muted">
              <div className="font-bold text-ink uppercase tracking-wider text-[8px] mb-1">Attached Diagnostics Data</div>
              <div>Route: <strong className="text-ink">{window.location.pathname}</strong></div>
              <div>Browser: <strong className="text-ink">HTML5 Chrome / WebKit Agent</strong></div>
              {conversationId && <div>Conversation: <strong className="text-ink">{conversationId}</strong></div>}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-line text-muted hover:bg-slate-50 hover:text-ink text-xs font-bold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !comments.trim()}
                className="px-4 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Submit Report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
