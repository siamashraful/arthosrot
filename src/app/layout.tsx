import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Ledgerline — paper trading",
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
      <body>
        <div className="paper-badge" role="note" aria-label="Simulation notice">
          Paper trading — simulated money
        </div>
        {children}
      </body>
    </html>
  );
}
