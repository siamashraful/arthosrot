"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef } from "react";
import { Icon } from "@/components/icons/Icon";
import { api } from "@/lib/api";
import { addMoney, toCents } from "@/lib/cash-transfer";
import { formatDateTime, formatMoney } from "@/lib/format";
import { CASH_DERIVED_KEYS } from "@/lib/queries";
import { CashTransferSheet } from "./CashTransferSheet";

/**
 * Settings → Cash (paper mode only): balance, what can be withdrawn and why
 * the rest can't, pending transfers, and the Add cash / Withdraw sheets.
 * While any transfer is PENDING the card polls every 15s (the read settles
 * due transfers server-side) and refreshes every cash-derived view the moment
 * one lands.
 */
export function CashCard({ hasAccount }: { hasAccount: boolean | undefined }) {
  const queryClient = useQueryClient();
  const uid = useId();
  const cash = useQuery({
    queryKey: ["account-cash"],
    queryFn: api.accountCash,
    enabled: hasAccount === true,
    refetchInterval: (query) =>
      query.state.data?.transfers.some((t) => t.state === "PENDING") ? 15_000 : false,
  });

  const pending = cash.data?.transfers.filter((t) => t.state === "PENDING") ?? [];
  const pendingCount = pending.length;
  const lastPending = useRef(pendingCount);
  useEffect(() => {
    // A pending transfer just settled (or failed): every cash view is stale.
    if (pendingCount < lastPending.current) {
      for (const queryKey of CASH_DERIVED_KEYS) {
        if (queryKey[0] === "account-cash") continue;
        void queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
    }
    lastPending.current = pendingCount;
  }, [pendingCount, queryClient]);

  const heading = (
    <h2 className="ar-heading" id={`${uid}-heading`}>
      Cash
    </h2>
  );

  if (hasAccount === false) {
    return (
      <section
        aria-labelledby={`${uid}-heading`}
        className="ar-card"
        style={{ display: "grid", gap: 8 }}
      >
        {heading}
        <p className="ar-body ar-secondary" style={{ margin: 0 }}>
          Open your practice account to add or withdraw cash.
        </p>
      </section>
    );
  }

  if (hasAccount === undefined || cash.isPending) {
    return (
      <section
        aria-labelledby={`${uid}-heading`}
        aria-busy="true"
        className="ar-card"
        style={{ paddingTop: 16, paddingBottom: 8 }}
      >
        {heading}
        {[0, 1].map((i) => (
          <div key={i} className="ar-skel-row">
            <div className="ar-skel-row__main">
              <span className="ar-skel ar-skel--text" style={{ width: "45%" }} />
              <span className="ar-skel ar-skel--text" style={{ width: "70%" }} />
            </div>
            <div className="ar-skel-row__end">
              <span className="ar-skel ar-skel--text" style={{ width: 80 }} />
            </div>
          </div>
        ))}
      </section>
    );
  }

  if (cash.isError || !cash.data) {
    return (
      <section
        aria-labelledby={`${uid}-heading`}
        className="ar-card"
        style={{ display: "grid", gap: 12 }}
      >
        {heading}
        <p role="alert" className="field-error" style={{ margin: 0 }}>
          Cash details couldn&apos;t be loaded.
        </p>
        <div>
          <button
            type="button"
            className="ar-btn ar-btn--secondary ar-btn--compact"
            onClick={() => void cash.refetch()}
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  const data = cash.data;
  const active = data.status === "ACTIVE";
  const held = addMoney(data.reservedForOrders, data.pendingWithdrawals);
  const canWithdraw = toCents(data.withdrawable) > 0n;
  const withdrawNoteId = `${uid}-withdraw-note`;

  return (
    <section
      aria-labelledby={`${uid}-heading`}
      className="ar-card"
      style={{ paddingTop: 16, display: "grid", gap: 4 }}
    >
      {heading}
      <div className="ar-list">
        <div className="ar-row ar-row--setting">
          <div className="ar-row__main">
            <span className="ar-row__title">Cash balance</span>
            <span className="ar-row__sub">Simulated money</span>
          </div>
          <div className="ar-row__end">
            <span className="ar-row__value tabular">{formatMoney(data.cash)}</span>
          </div>
        </div>
        <div className="ar-row ar-row--setting">
          <div className="ar-row__main">
            <span className="ar-row__title">Available to withdraw</span>
            <span className="ar-row__sub tabular" style={{ whiteSpace: "normal" }}>
              Cash held for open buy orders and pending withdrawals can&apos;t be withdrawn
              {toCents(held) > 0n ? `: ${formatMoney(held)} is held now.` : "."}
            </span>
          </div>
          <div className="ar-row__end">
            <span className="ar-row__value tabular">{formatMoney(data.withdrawable)}</span>
          </div>
        </div>
      </div>

      {pending.length > 0 ? (
        <>
          <h3 className="ar-group-label" style={{ margin: "12px 0 0" }}>
            Pending transfers
          </h3>
          <ul className="ar-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {pending.map((t) => {
              const isDeposit = t.direction === "DEPOSIT";
              return (
                <li key={t.id} className="ar-row">
                  <span
                    className={`ar-chipicon ar-chipicon--${isDeposit ? "gain" : "loss"}`}
                    aria-hidden
                  >
                    <Icon name={isDeposit ? "arrow-down-left" : "arrow-up-right"} />
                  </span>
                  <div className="ar-row__main">
                    <span className="ar-row__title">{isDeposit ? "Deposit" : "Withdrawal"}</span>
                    <span className="ar-row__sub">Started {formatDateTime(t.createdAt)}</span>
                  </div>
                  <div className="ar-row__end">
                    <span className={`ar-row__value${isDeposit ? " ar-row__value--gain" : ""}`}>
                      <span className="sr-only">{isDeposit ? "in " : "out "}</span>
                      {isDeposit ? "+" : "−"}
                      {formatMoney(t.amount)}
                    </span>
                    <span className="ar-tag ar-tag--pending">
                      <Icon name="clock" size={12} stroke={2.25} />
                      Pending
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="ar-caption ar-tertiary" style={{ margin: 0 }}>
            The sandbox usually settles transfers in a few minutes. This list updates on its own.
          </p>
        </>
      ) : null}

      {active ? (
        <div style={{ display: "grid", gap: 8, padding: "12px 0 4px" }}>
          <div className="ar-btn-row">
            <CashTransferSheet
              direction="DEPOSIT"
              cash={data}
              triggerClassName="ar-btn ar-btn--primary"
            />
            <CashTransferSheet
              direction="WITHDRAWAL"
              cash={data}
              disabled={!canWithdraw}
              describedBy={canWithdraw ? undefined : withdrawNoteId}
              triggerClassName="ar-btn ar-btn--secondary"
            />
          </div>
          {!canWithdraw ? (
            <p id={withdrawNoteId} className="ar-caption ar-tertiary" style={{ margin: 0 }}>
              Nothing is available to withdraw right now
              {toCents(held) > 0n
                ? ": your cash is held for open buy orders or pending withdrawals."
                : "."}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="ar-caption ar-secondary" style={{ margin: "8px 0 4px" }}>
          Your account is still being set up. Adding and withdrawing cash opens once it&apos;s
          ready.
        </p>
      )}
    </section>
  );
}
