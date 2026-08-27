import type { Metadata, Viewport } from "next";
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
        {/* Apply the stored theme BEFORE hydration so first paint never
            flashes the wrong palette (tokens.css [data-theme] switch). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();',
          }}
        />
      </head>
      <body>
        <div className="paper-badge" role="note" aria-label="Simulation notice">
          Paper trading — simulated money
        </div>
        {children}
      </body>
    </html>
  );
}
