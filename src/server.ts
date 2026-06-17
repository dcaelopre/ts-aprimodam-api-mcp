import "dotenv/config";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response } from "express";
import { AprimoClient } from "./aprimo/client.js";
import { resolveAprimoConfig } from "./config.js";
import { registerFieldDefinitionTools } from "./tools/field-definitions.js";
import { registerRecordTools } from "./tools/records.js";
import { registerUploadTools } from "./tools/upload.js";

interface McpSession {
  transport: StreamableHTTPServerTransport;
  aprimo: AprimoClient;
}

function validateProtocolVersion(req: Request, res: Response): boolean {
  const version = req.headers["mcp-protocol-version"] as string | undefined;
  if (version && !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
    res.status(400).json({ error: `Unsupported MCP-Protocol-Version: ${version}` });
    return false;
  }
  return true;
}

function createServer(aprimo: AprimoClient): McpServer {
  const server = new McpServer(
    { name: "aprimo-dam-api-mcp", version: "0.1.0" },
    {
      instructions:
        "This server integrates with Aprimo DAM. Record IDs are GUIDs — do not guess them. Typical asset workflow: upload_file → create_record (with master_file_upload_token). Use get_field_definitions to discover metadata fields, and get_record / get_record_fields / get_record_files to read data.",
    },
  );

  registerRecordTools(server, aprimo);
  registerUploadTools(server, aprimo);
  registerFieldDefinitionTools(server, aprimo);
  return server;
}

const sessions: Record<string, McpSession> = {};

const mcpPostHandler = async (req: Request, res: Response): Promise<void> => {
  if (!validateProtocolVersion(req, res)) {
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    if (sessionId && sessions[sessionId]) {
      await sessions[sessionId].transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const aprimoConfig = resolveAprimoConfig(req.headers);
      const aprimo = new AprimoClient(aprimoConfig);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions[id] = { transport, aprimo };
        },
      });

      transport.onclose = () => {
        const id = transport.sessionId;
        if (id && sessions[id]) {
          delete sessions[id];
        }
      };

      const server = createServer(aprimo);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: null,
    });
  } catch (error) {
    if (!res.headersSent) {
      const message = error instanceof Error ? error.message : "Internal server error";
      const status = message.includes("Missing Aprimo credentials") ? 401 : 500;
      res.status(status).json({
        jsonrpc: "2.0",
        error: {
          code: status === 401 ? -32001 : -32603,
          message,
        },
        id: null,
      });
    }
  }
};

const mcpGetHandler = async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !sessions[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  await sessions[sessionId].transport.handleRequest(req, res);
};

const mcpDeleteHandler = async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !sessions[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  await sessions[sessionId].transport.handleRequest(req, res);
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
  console.log("  Auth:   X-Aprimo-Environment / X-Aprimo-Client-Id / X-Aprimo-Client-Secret headers");
});

process.on("SIGINT", async () => {
  for (const sessionId of Object.keys(sessions)) {
    await sessions[sessionId]?.transport.close();
    delete sessions[sessionId];
  }
  process.exit(0);
});
