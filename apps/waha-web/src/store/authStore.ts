import { create } from "zustand";
import axios from "axios";

// Configure axios base settings for backend APIs
axios.defaults.baseURL = "http://localhost:3002";
axios.defaults.withCredentials = true;

export type UserRole = "ADMIN" | "USER" | "CXO";
export type Persona = "CRM" | "SERVICE" | "ADMIN" | "CXO";

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  defaultPersona: Persona;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserResponse | null;
  currentPersona: Persona | null;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setPersona: (persona: Persona) => void;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  currentPersona: null,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.post("/api/auth/login", { email, password });
      const user = response.data.user as UserResponse;
      set({
        isAuthenticated: true,
        user,
        currentPersona: user.defaultPersona,
        isLoading: false,
        error: null
      });
      return true;
    } catch (err: any) {
      const message = err.response?.data?.message || "Invalid credentials.";
      set({ isLoading: false, error: message });
      return false;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await axios.post("/api/auth/logout");
    } catch {
      // Proceed with local logout cleanup even if network fails
    } finally {
      set({
        isAuthenticated: false,
        user: null,
        currentPersona: null,
        isLoading: false,
        error: null
      });
    }
  },

  setPersona: (persona) => set({ currentPersona: persona }),

  checkSession: async () => {
    set({ isLoading: true });
    try {
      const response = await axios.get("/api/auth/me");
      const user = response.data.user as UserResponse;
      set({
        isAuthenticated: true,
        user,
        currentPersona: user.defaultPersona,
        isLoading: false
      });
    } catch {
      set({
        isAuthenticated: false,
        user: null,
        currentPersona: null,
        isLoading: false
      });
    }
  }
}));
