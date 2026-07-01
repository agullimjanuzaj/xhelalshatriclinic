import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  selectedBranchId: string | null;
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';

  setSelectedBranchId: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedBranchId: null,
      // Default closed — the sidebar overlay covers the whole screen if left
      // open after login on mobile. Desktop ignores this via lg:translate-x-0.
      sidebarOpen: false,
      theme: 'system',

      setSelectedBranchId: (id) => set({ selectedBranchId: id }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'xhelal-clinic-app',
      partialize: (state) => ({
        selectedBranchId: state.selectedBranchId,
        theme: state.theme,
      }),
    },
  ),
);
