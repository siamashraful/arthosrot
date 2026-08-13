// Liveness: the process responds. No dependency checks (DEPLOYMENT.md).
export async function GET() {
  return Response.json({ status: "ok" });
}
