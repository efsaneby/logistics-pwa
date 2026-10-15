import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TruckLog",
  description: "Uren, ritten en vergoedingen voor chauffeurs in Nederland",
  manifest: "/manifest.json",
  icons: {
    icon: "/trucklog.png",
    apple: "/trucklog.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TruckLog",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl-NL">
      <body className="antialiased bg-slate-50">{children}</body>
    </html>
  );
}
