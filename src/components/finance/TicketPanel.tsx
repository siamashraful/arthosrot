"use client";

import { useRef } from "react";
import { Icon } from "@/components/icons/Icon";
import { useTradingMode } from "@/components/trading-mode";
import type { QuoteDto } from "@/lib/api";
import { TradingTicket } from "./TradingTicket";

/**
 * Responsive ticket container (docs/design/RESPONSIVE_BEHAVIOR.md): docked
 * panel >= lg; below lg a pinned "Trade" bar opens the ticket as a bottom
 * sheet (native <dialog> styled via .sheet — focus trapping and Esc for free).
 */
export function TicketPanel(props: {
  symbol: string;
  quote: QuoteDto | null;
  buyingPower: string;
  sellable: string;
}) {
  const mode = useTradingMode();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // In live preview no order may even be drafted — the ticket would price a
  // paper account's buying power as if it were real money (ADR-011).
  if (mode === "live") {
    return (
      <div className="ar-card">
        <p className="ar-body ar-secondary" style={{ margin: 0 }}>
          Live orders aren&apos;t available yet — switch back to Practice in Settings to trade.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="ticket-docked">
        <TradingTicket {...props} />
      </div>
      <div className="ticket-mobile">
        <button
          type="button"
          className="ar-btn ar-btn--primary ar-btn--hero ar-btn--block"
          onClick={() => dialogRef.current?.showModal()}
        >
          Trade {props.symbol}
        </button>
        <dialog ref={dialogRef} className="sheet" aria-label={`Trade ${props.symbol}`}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button
              type="button"
              className="ar-btn ar-btn--icon"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
            >
              <Icon name="x" size={20} />
            </button>
          </div>
          <TradingTicket {...props} />
        </dialog>
      </div>
    </>
  );
}
