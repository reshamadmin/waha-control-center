import { RouterProvider } from "react-router-dom";
import { router } from "./routes/index.js";
import { useEffect, useState } from "react";
import { useAuthStore } from "./store/authStore.js";
import { FeedbackModal } from "./features/developer/FeedbackModal.js";
import { SystemNotifications } from "./components/SystemNotifications.js";
import { AlertTriangle } from "lucide-react";

export default function App() {
  const { checkSession, isLoading, isAuthenticated } = useAuthStore();
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <>
      <RouterProvider router={router} />
      <SystemNotifications />
      
      {/* Floating Report Issue Trigger Button */}
      {isAuthenticated && (
        <button
          onClick={() => setIsFeedbackOpen(true)}
          className="fixed bottom-6 right-6 p-3 bg-danger text-white rounded-full hover:bg-danger/90 transition-all shadow-xl z-40 pointer-events-auto flex items-center justify-center border border-white/20 hover:scale-105"
          title="Report Issue"
        >
          <AlertTriangle className="w-5 h-5" />
        </button>
      )}

      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
    </>
  );
}
