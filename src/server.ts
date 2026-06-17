import "dotenv/config";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response } from "express";
import { AprimoClient } from "./aprimo/client.js";
import { loadConfig } from "./config.js";
import { registerRecordTools } from "./tools/records.js";

function validateProtocolVersion(req: Request, res: Response): boolean {
  const version = req.headers["mcp-protocol-version"] as string | undefined;
  if (version && !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
    res.status(400).json({ error: `Unsupported MCP-Protocol-Version: ${version}` });
    return false;
  }
  return true;
}

const config = loadConfig();
const aprimo = new AprimoClient(config);

function createServer(): McpServer {
  const server = new McpServer(
    { name: "aprimo-dam-api-mcp", version: "0.1.0" },
    {
      instructions:
        "This server reads data from Aprimo DAM. Record IDs are GUIDs — do not guess them. Use get_record for asset metadata, get_record_fields for metadata field values, and get_record_files for attached files and renditions.",
    },
  );

  registerRecordTools(server, aprimo);
  return server;
}

const transports: Record<string, StreamableHTTPServerTransport> = {};

const mcpPostHandler = async (req: Request, res: Response): Promise<void> => {
  if (!validateProtocolVersion(req, res)) {
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports[id] = transport;
        },
      });

      transport.onclose = () => {
        const id = transport.sessionId;
        if (id && transports[id]) {
          delete transports[id];
        }
      };

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal server error",
        },
        id: null,
      });
    }
  }
};

const mcpGetHandler = async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  await transports[sessionId].handleRequest(req, res);
};

const mcpDeleteHandler = async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  await transports[sessionId].handleRequest(req, res);
};

const app = createMcpExpressApp({ host: process.env.HOST ?? "0.0.0.0" });

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "aprimo-dam-api-mcp" });
});

app.post("/mcp", mcpPostHandler);
app.get("/mcp", mcpGetHandler);
app.delete("/mcp", mcpDeleteHandler);

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

app.listen(port, host, () => {
  console.log(`Aprimo DAM MCP server listening on http://localhost:${port}`);
  console.log(`  Health: http://localhost:${port}/health`);
  console.log(`  MCP:    http://localhost:${port}/mcp`);
});

process.on("SIGINT", async () => {
  for (const sessionId of Object.keys(transports)) {
    await transports[sessionId]?.close();
    delete transports[sessionId];
  }
  process.exit(0);
});
