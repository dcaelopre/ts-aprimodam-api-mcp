# Connect Claude & Other LLMs to the Aprimo MCP Server

The hosted MCP server supports **per-user Aprimo credentials** passed as HTTP headers via [`mcp-remote`](https://www.npmjs.com/package/mcp-remote). This lets Claude Desktop, Cursor, and other MCP clients connect without storing Aprimo secrets on the server.

## How it works

```
Claude Desktop / Cursor
    → mcp-remote (local stdio bridge)
    → HTTPS + Aprimo headers
    → Azure Web App /mcp
    → Aprimo DAM API
```

### Required HTTP headers

| Header | Description |
|--------|-------------|
| `X-Aprimo-Environment` | Aprimo tenant subdomain (e.g. `ps4` → `ps4.dam.aprimo.com`) |
| `X-Aprimo-Client-Id` | OAuth client ID |
| `X-Aprimo-Client-Secret` | OAuth client secret |

Alternatively, the server can use `APRIMO_TENANT`, `APRIMO_CLIENT_ID`, and `APRIMO_CLIENT_SECRET` environment variables (Azure App Settings) when headers are not provided.

---

## Claude Desktop

Edit your Claude Desktop config file:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "celopre-aprimo-mcp-server": {
      "command": "C:\\Program Files\\nodejs\\npx.cmd",
      "args": [
        "-y",
        "mcp-remote",
        "https://ts-aprimodam-api-mcp-g6g6awghawaeb7f5.eastus-01.azurewebsites.net/mcp",
        "--transport",
        "http-only",
        "--header",
        "X-Aprimo-Environment:${APRIMO_ENVIRONMENT}",
        "--header",
        "X-Aprimo-Client-Id:${APRIMO_CLIENT_ID}",
        "--header",
        "X-Aprimo-Client-Secret:${APRIMO_CLIENT_SECRET}"
      ],
      "env": {
        "APRIMO_ENVIRONMENT": "your-tenant",
        "APRIMO_CLIENT_ID": "your-client-id",
        "APRIMO_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

> **macOS/Linux:** use `"command": "npx"` instead of the Windows `npx.cmd` path.

Restart Claude Desktop after saving.

See also: [examples/claude-desktop-config.json](../examples/claude-desktop-config.json)

---

## Cursor

**Cursor Settings** → **MCP** → **Add new MCP server** (or edit `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "celopre-aprimo-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://ts-aprimodam-api-mcp-g6g6awghawaeb7f5.eastus-01.azurewebsites.net/mcp",
        "--transport",
        "http-only",
        "--header",
        "X-Aprimo-Environment:${APRIMO_ENVIRONMENT}",
        "--header",
        "X-Aprimo-Client-Id:${APRIMO_CLIENT_ID}",
        "--header",
        "X-Aprimo-Client-Secret:${APRIMO_CLIENT_SECRET}"
      ],
      "env": {
        "APRIMO_ENVIRONMENT": "your-tenant",
        "APRIMO_CLIENT_ID": "your-client-id",
        "APRIMO_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

---

## Claude.ai (web) — Custom Connector

1. Go to **Settings** → **Connectors** → **Add custom connector**
2. URL: `https://ts-aprimodam-api-mcp-g6g6awghawaeb7f5.eastus-01.azurewebsites.net/mcp`
3. If the connector UI supports custom headers, add:
   - `X-Aprimo-Environment`
   - `X-Aprimo-Client-Id`
   - `X-Aprimo-Client-Secret`

> Claude.ai connector header support varies. If headers are not available, set `APRIMO_*` values as Azure App Service environment variables instead.

---

## Claude Code (CLI)

```bash
claude mcp add celopre-aprimo-mcp-server \
  --command "npx" \
  --args "-y" "mcp-remote" "https://YOUR-APP.azurewebsites.net/mcp" "--transport" "http-only" \
  --env APRIMO_ENVIRONMENT=your-tenant \
  --env APRIMO_CLIENT_ID=your-client-id \
  --env APRIMO_CLIENT_SECRET=your-client-secret
```

For header passthrough via env substitution, use a wrapper script or the full `mcp-remote` args as shown in Claude Desktop config.

---

## Other LLMs (OpenAI, etc.)

Any client that supports MCP over HTTP with custom headers can connect directly:

- **Endpoint:** `https://<your-app>.azurewebsites.net/mcp`
- **Transport:** Streamable HTTP
- **Headers:** `X-Aprimo-Environment`, `X-Aprimo-Client-Id`, `X-Aprimo-Client-Secret`

Clients that only support stdio should use `mcp-remote` as a local bridge (same pattern as Claude Desktop).

---

## Deployment modes

| Mode | Where credentials live | Best for |
|------|------------------------|----------|
| **Header auth** (this guide) | Client `env` block / user machine | Multi-user, per-tenant access |
| **Server env vars** | Azure App Settings | Single shared integration account |

Both modes work. Header auth takes priority when headers are present.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Server shows "running" but tools fail | Check Aprimo credentials in the `env` block |
| `Missing Aprimo credentials` | Ensure all three headers are sent on initialize |
| Connection timeout | Verify Azure Web App is running; test `/health` |
| `mcp-remote` not found | Ensure Node.js and `npx` are installed |

Test health without credentials:

```
https://<your-app>.azurewebsites.net/health
```
