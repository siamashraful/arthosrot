import http from "node:http";
import { env } from "@/env";

/**
 * Ledgerline event/reconciliation worker — scaffold stub.
 *
 * Final responsibilities (docs/architecture/EXECUTION.md):
 *  - consume the broker's replayable SSE trade-event stream (cursor in stream_cursors)
 *  - translate vendor events to canonical BrokerEvents and apply them via ExecutionService
 *  - run reconciliation on startup, reconnect, schedule (/reconcile), and on demand
 *
 * Until the execution phases land, this stub only exposes the health endpoint so the
 * deployment topology (Render web service + GitHub Actions reconcile schedule) can be
 * wired and verified early.
 */
function main(): void {
  const { PORT } = env();

  const server = http.createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", role: "worker", ingest: "not-implemented" }));
      return;
    }
    if (req.url === "/reconcile" && req.method === "POST") {
      // Reconciliation engine arrives with the execution phases; respond honestly.
      res.writeHead(501, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "not-implemented" }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "not-found" }));
  });

  server.listen(PORT, () => {
    console.log(JSON.stringify({ msg: "worker listening", port: PORT }));
  });
}

main();
