'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (!isAuthenticated && pathname !== '/login') {
      router.replace('/login');
    } else if (isAuthenticated && pathname === '/login') {
      router.replace('/');
    }
  }, [isAuthenticated, pathname, router, mounted]);

  // Prevent flash of content if not authenticated and trying to access protected route
  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  const isProtected = pathname !== '/login';

  if (!isAuthenticated && isProtected) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return <>{children}</>;
}
