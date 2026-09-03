import type { Metadata, Viewport } from "next";
import { ModeRibbon } from "@/components/mode-ribbon";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Arthosrot — paper trading",
  description:
    "Paper-trading platform. Simulated money only — not real trading or investment advice.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the stored theme and trading mode BEFORE hydration so first
            paint never flashes the wrong palette (tokens.css [data-theme] and
            [data-mode] switches). Static string, no user input — the single
            sanctioned dangerouslySetInnerHTML (SECURITY.md). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}var m=localStorage.getItem("trading-mode");if(m==="live"){document.documentElement.setAttribute("data-mode","live");}}catch(e){}})();',
          }}
        />
      </head>
      <body>
        <ModeRibbon />
        {children}
      </body>
    </html>
  );
}
