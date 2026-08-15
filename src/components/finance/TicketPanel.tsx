"use client";

import { useRef } from "react";
import type { QuoteDto } from "@/lib/api";
import { TradingTicket } from "./TradingTicket";

/**
 * Responsive ticket container (docs/design/RESPONSIVE_BEHAVIOR.md): docked
 * panel >= lg; below lg a "Trade" button opens the ticket as a bottom sheet
 * (native <dialog> styled via .sheet — focus trapping and Esc for free).
 */
export function TicketPanel(props: {
  symbol: string;
  quote: QuoteDto;
  buyingPower: string;
  sellable: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <div className="ticket-docked">
        <TradingTicket {...props} />
      </div>
      <div className="ticket-mobile">
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%" }}
          onClick={() => dialogRef.current?.showModal()}
        >
          Trade {props.symbol}
        </button>
        <dialog ref={dialogRef} className="sheet" aria-label={`Trade ${props.symbol}`}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => dialogRef.current?.close()}
            >
              Close
            </button>
          </div>
          <TradingTicket {...props} />
        </dialog>
      </div>
    </>
  );
}
