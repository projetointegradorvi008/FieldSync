import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AuthProvider } from "@/contexts/auth-context";
import { ToastProvider } from "@/contexts/toast-context";
import { ToastViewport } from "@/components/ui/toast-viewport";
import "./globals.css";

// Layout raiz compartilhado por todas as páginas: fontes, <html>/<body>, e o
// AuthProvider (para qualquer página conseguir usar useAuth()).
export const metadata: Metadata = {
  title: "FieldSync",
  description: "Plataforma de pesquisas operacionais em campo",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
          <ToastViewport />
        </ToastProvider>
      </body>
    </html>
  );
}
