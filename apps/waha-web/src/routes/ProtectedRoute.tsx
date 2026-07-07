import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore.js";

export const ProtectedRoute = ({ allowedPersonas }: { allowedPersonas?: string[] }) => {
  const { isAuthenticated, isLoading, currentPersona } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedPersonas && (!currentPersona || !allowedPersonas.includes(currentPersona))) {
    return <Navigate to="/select-persona" replace />;
  }

  return <Outlet />;
};
