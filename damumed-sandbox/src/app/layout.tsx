import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Damumed Sandbox",
  description: "Демо-платформа для тестирования MedBot Chrome Extension"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
