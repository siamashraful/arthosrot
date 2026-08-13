import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Ledgerline — paper trading",
  description: "Paper-trading platform. Simulated money only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="paper-badge" role="note" aria-label="Simulation notice">
          Paper trading — simulated money
        </div>
        {children}
      </body>
    </html>
  );
}
