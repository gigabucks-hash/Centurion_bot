import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { bearerMatches, loopbackHost, loopbackOrigin } from "../lib/local/http-guard.ts";
import { createCenturionServer } from "./server.ts";
import { localToken } from "./token.ts";

const token = localToken();
if (token.length < 32) {
  console.error("Berkas mcp.token belum ada. Jalankan aplikasi web lokal sekali, lalu coba lagi.");
  process.exit(1);
}
process.env.CENTURION_MCP_TOKEN ??= token;
const port = Number(process.env.CENTURION_MCP_PORT ?? 3210);

const httpServer = createServer(async (req, res) => {
  const remote = req.socket.remoteAddress ?? "";
  const loopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  const host = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host ?? "";
  const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
  if (!loopback || !loopbackHost(host) || (origin && !loopbackOrigin(origin))) {
    res.writeHead(403).end("localhost only");
    return;
  }
  if (!bearerMatches(req.headers.authorization ?? "", token)) {
    res.writeHead(401).end("unauthorized");
    return;
  }
  if (!req.url?.startsWith("/mcp")) {
    res.writeHead(404).end("not found");
    return;
  }
  const server = createCenturionServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

httpServer.listen(port, "127.0.0.1", () => {
  console.error(`Centurion MCP HTTP di http://127.0.0.1:${port}/mcp`);
});
