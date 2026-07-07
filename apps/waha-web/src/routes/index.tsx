import { createBrowserRouter, Navigate } from "react-router-dom";
import { Login } from "../features/auth/Login.js";
import { PersonaSelection } from "../features/auth/PersonaSelection.js";
import { ProtectedRoute } from "./ProtectedRoute.js";

// Temporary screen layouts to satisfy router endpoints compile boundaries
const CrmInboxPlaceholder = () => (
  <div className="p-8">
    <h1 className="text-2xl font-bold">CRM Inbox</h1>
    <p className="text-muted text-sm mt-1">Inbox channel is ready for implementation in Sprint 3.</p>
  </div>
);

const SettingsProfilePlaceholder = () => (
  <div className="p-8">
    <h1 className="text-2xl font-bold">Settings Profile</h1>
    <p className="text-muted text-sm mt-1">Profile configuration is ready for implementation in Sprint 5.</p>
  </div>
);

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/select-persona", element: <PersonaSelection /> },
  {
    element: <ProtectedRoute />, // Basic Auth Guard
    children: [
      {
        path: "/",
        element: <Navigate to="/select-persona" replace />
      },
      {
        element: <ProtectedRoute allowedPersonas={["CRM", "ADMIN"]} />,
        children: [
          { path: "crm/inbox", element: <CrmInboxPlaceholder /> }
        ]
      },
      {
        element: <ProtectedRoute allowedPersonas={["ADMIN"]} />,
        children: [
          { path: "settings/profile", element: <SettingsProfilePlaceholder /> }
        ]
      }
    ]
  },
  { path: "*", element: <Navigate to="/login" replace /> }
]);
