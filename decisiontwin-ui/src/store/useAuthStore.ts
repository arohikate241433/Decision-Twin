import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  name: string;
  role: string;
  organization: string;
  email: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      login: (user) => set({ isAuthenticated: true, user }),
      logout: () => set({ isAuthenticated: false, user: null }),
    }),
    {
      name: 'decision-twin-auth',
    }
  )
);
