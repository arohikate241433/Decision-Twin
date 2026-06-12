import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Navigation from "@/components/Navigation";
import AuthGuard from "@/components/AuthGuard";

export const metadata: Metadata = {
  title: "DecisionTwin | AI Ethics Simulation",
  description: "Eliminating Invisible Bias through Longitudinal Simulation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#F5F7FA] text-slate-800 min-h-screen antialiased">
        <Providers>
          <AuthGuard>
            {/* Sidebar + content shell */}
            <div className="flex h-screen overflow-hidden">
              <Navigation />
              <main className="flex-1 overflow-y-auto">
                {children}
              </main>
            </div>
          </AuthGuard>
        </Providers>
      </body>
    </html>
  );
}