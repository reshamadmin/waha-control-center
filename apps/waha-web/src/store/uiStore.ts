import { create } from "zustand";

interface UiState {
  currentPersona: "CRM" | "SERVICE" | "ADMIN" | "CXO";
  activeChatId: string | null;
  sidebarOpen: boolean;
  theme: "light" | "dark" | "system";
  setPersona: (persona: "CRM" | "SERVICE" | "ADMIN" | "CXO") => void;
  setActiveChatId: (chatId: string | null) => void;
  toggleSidebar: () => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
}

export const useUiStore = create<UiState>((set) => ({
  currentPersona: "CRM",
  activeChatId: null,
  sidebarOpen: true,
  theme: "system",
  setPersona: (persona) => set({ currentPersona: persona }),
  setActiveChatId: (chatId) => set({ activeChatId: chatId }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setTheme: (theme) => set({ theme })
}));
