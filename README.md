# Aprimo DAM API MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes read tools for the [Aprimo DAM REST API](https://developers.aprimo.com/). Designed for deployment to Azure via Docker.

## Tools

| Tool | Description |
|------|-------------|
| `get_record` | Read core record/asset metadata (title, status, content type, timestamps) |
| `get_record_fields` | Read metadata field values; optionally filter by field or field group |
| `get_record_files` | Read attached files, master file, and optionally renditions/public links |

## Prerequisites

1. An Aprimo tenant with DAM enabled
2. An OAuth 2.0 **Client Credentials** registration in Aprimo Administration → Integration → Registrations
   - Flow type: Client Credentials
   - Scope: `api`
   - Assign an integration user with appropriate DAM read permissions

## Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `APRIMO_TENANT` | Tenant subdomain (e.g. `mycompany` → `mycompany.dam.aprimo.com`) |
| `APRIMO_CLIENT_ID` | OAuth client ID from your registration |
| `APRIMO_CLIENT_SECRET` | OAuth client secret from your registration |
| `PORT` | Server port (default: `3000`) |
| `ALLOWED_ORIGINS` | Optional comma-separated Origin allowlist for `/mcp` |

## Local development

```bash
npm install
npm run dev
```

Test with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
# Connect to http://localhost:3000/mcp (Streamable HTTP)
```

## Connect in Claude

```bash
claude mcp add --transport http aprimo-dam http://localhost:3000/mcp
```

For Claude Desktop / Claude.ai, add a custom connector pointing to your deployed URL.

**Client setup (Claude, Cursor, other LLMs):** see **[docs/client-configuration.md](docs/client-configuration.md)** — uses `mcp-remote` with `X-Aprimo-*` headers.

## Docker

```bash
docker build -t aprimo-dam-api-mcp .
docker run -p 3000:3000 \
  -e APRIMO_TENANT=your-tenant \
  -e APRIMO_CLIENT_ID=your-client-id \
  -e APRIMO_CLIENT_SECRET=your-client-secret \
  aprimo-dam-api-mcp
```

## Azure deployment

**Manual Web App (Portal):** see **[docs/azure-webapp-manual.md](docs/azure-webapp-manual.md)**

**Automated Container Apps:** see **[docs/azure-deployment.md](docs/azure-deployment.md)**

## API reference

Aprimo uses **Select Headers** to control which sub-resources are embedded in responses:

- `select-record: fields` — embed field values
- `select-record: files,masterfile` — embed file collections
- `select-fileversion: renditions` — embed renditions on file versions

See the [Aprimo DAM REST API docs](https://{your-tenant}.dam.aprimo.com/api/core/docs) for full details.

## License

MIT
