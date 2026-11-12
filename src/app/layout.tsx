import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Тести Худшиносӣ — Дар кадом ҳолати эҳсосӣ қарор дорӣ?",
  description:
    "Ин тест ба ту кӯмак мекунад, ки ҳолати худро дар масъалаҳои пул, саломатӣ, муҳаббат, оила, кор, худбаҳоӣ ва оромии ботинӣ беҳтар бишносӣ.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tg">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&family=Manrope:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans bg-[#FAF8F5] text-[#1F1D1A] min-h-screen selection:bg-[#EAD8D3] selection:text-[#1F1D1A]">
        {children}
      </body>
    </html>
  );
}
