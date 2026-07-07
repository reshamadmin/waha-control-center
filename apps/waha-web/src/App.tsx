import { RouterProvider } from "react-router-dom";
import { router } from "./routes/index.js";
import { useEffect } from "react";
import { useAuthStore } from "./store/authStore.js";

export default function App() {
  const { checkSession, isLoading } = useAuthStore();

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

  return <RouterProvider router={router} />;
}
