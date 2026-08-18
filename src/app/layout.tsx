import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { auth } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { ToastProvider } from "@/components/toast-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Consola de negocios",
  description: "Scraper de negocios por zona + CRM de seguimiento de llamadas",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col text-slate-100">
        <ToastProvider>
          {session?.user && <Nav user={session.user} />}
          <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
        </ToastProvider>
      </body>
    </html>
  );
}
