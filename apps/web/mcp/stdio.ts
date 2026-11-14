import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCenturionServer } from "./server.ts";
import { localToken } from "./token.ts";

process.env.CENTURION_MCP_TOKEN ??= localToken();
const server = createCenturionServer();
await server.connect(new StdioServerTransport());
