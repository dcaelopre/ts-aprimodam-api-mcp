# Manual Azure Web App Deployment

Deploy the Aprimo DAM MCP server to **Azure App Service (Web App)** using the Azure Portal. This guide uses a **Linux Web App with a Docker container**.

## Architecture

```
Docker image (ACR) → Azure Web App (Linux) → https://<app-name>.azurewebsites.net/mcp
```

## Prerequisites

- Azure subscription
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (optional, for building the image)
- Aprimo credentials (tenant, client ID, client secret)

---

## Part 1 — Create resources in Azure Portal

### 1. Resource group

1. Go to [Azure Portal](https://portal.azure.com) → **Create a resource**
2. Search **Resource group** → Create
3. Name: `rg-aprimo-dam-mcp`
4. Region: choose one close to you (e.g. **Southeast Asia**)
5. Click **Review + create**

### 2. Container registry (ACR)

1. **Create a resource** → search **Container registry**
2. Settings:
   - Resource group: `rg-aprimo-dam-mcp`
   - Registry name: globally unique (e.g. `acraprimodamdcae01`)
   - SKU: **Basic**
   - Admin user: **Enabled**
3. Click **Review + create** → **Create**

### 3. App Service plan

1. **Create a resource** → search **App Service plan**
2. Settings:
   - Resource group: `rg-aprimo-dam-mcp`
   - Name: `plan-aprimo-dam-mcp`
   - Operating system: **Linux**
   - Region: same as resource group
   - Pricing tier: **B1** (or **F1** for dev/testing)
3. Click **Review + create** → **Create**

### 4. Web App (Docker)

1. **Create a resource** → search **Web App**
2. **Basics** tab:
   - Resource group: `rg-aprimo-dam-mcp`
   - Name: globally unique (e.g. `aprimo-dam-mcp`) — this becomes `https://aprimo-dam-mcp.azurewebsites.net`
   - Publish: **Docker Container**
   - Operating system: **Linux**
   - Region: same as above
   - Linux plan: `plan-aprimo-dam-mcp`
3. **Docker** tab:
   - Options: **Single Container**
   - Image source: **Azure Container Registry**
   - Registry: select the ACR you created
   - Image: `aprimo-dam-mcp` (you will push this in Part 2)
   - Tag: `latest`
4. Click **Review + create** → **Create**

---

## Part 2 — Build and push the Docker image

From your project folder in PowerShell:

```powershell
cd C:\Users\DianaCarla.Elopre\.cursor\aprimo-dam-api-mcp

az login
az acr build `
  --registry acraprimodamdcae01 `
  --image aprimo-dam-mcp:latest `
  .
```

Replace `acraprimodamdcae01` with your ACR name. Azure builds the image in the cloud — no local Docker required.

---

## Part 3 — Configure the Web App

In Azure Portal → your **Web App** → **Settings**:

### Container settings

**Deployment Center** or **Container settings**:
- Image: `aprimo-dam-mcp:latest` from your ACR
- Continuous deployment: optional (can enable later with GitHub)

### Application settings

Go to **Settings** → **Environment variables** (or **Configuration** → **Application settings**) and add:

| Name | Value |
|------|-------|
| `WEBSITES_PORT` | `3000` |
| `PORT` | `3000` |
| `HOST` | `0.0.0.0` |
| `APRIMO_TENANT` | your tenant (e.g. `ps4`) |
| `APRIMO_CLIENT_ID` | your OAuth client ID |
| `APRIMO_CLIENT_SECRET` | your OAuth client secret |

> `WEBSITES_PORT` tells App Service which port your container listens on. This is required.

Click **Save** and allow the app to restart.

### Health check (recommended)

**Settings** → **Health check**:
- Enable: **On**
- Path: `/health`

---

## Part 4 — Verify

Your app URL (from Azure Overview):

```
https://ts-aprimodam-api-mcp-g6g6awghawaeb7f5.eastus-01.azurewebsites.net
```

```powershell
Invoke-RestMethod https://ts-aprimodam-api-mcp-g6g6awghawaeb7f5.eastus-01.azurewebsites.net/health
```

Expected response:

```json
{"status":"ok","service":"aprimo-dam-api-mcp"}
```

Your MCP endpoint:

```
https://ts-aprimodam-api-mcp-g6g6awghawaeb7f5.eastus-01.azurewebsites.net/mcp
```

Test with MCP Inspector (Streamable HTTP) or connect in Claude:

```bash
claude mcp add --transport http aprimo-dam https://ts-aprimodam-api-mcp-g6g6awghawaeb7f5.eastus-01.azurewebsites.net/mcp
```

---

## Code deploy (Node.js) — if you chose Publish: Code

If your Web App uses **Node 22 LTS** and **GitHub Actions** (not Docker):

### 1. Environment variables

Web App → **Settings** → **Environment variables** → add:

| Name | Value |
|------|-------|
| `APRIMO_TENANT` | your tenant |
| `APRIMO_CLIENT_ID` | your client ID |
| `APRIMO_CLIENT_SECRET` | your client secret |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` |

> Do **not** rely on `.env` in Azure — set secrets in Application Settings.

### 2. Startup command

**Settings** → **Configuration** → **General settings** → **Startup Command**:

```
npm start
```

### 3. GitHub secret for deployment

1. Web App → **Download publish profile**
2. GitHub repo → **Settings** → **Secrets** → **Actions**
3. Add secret: `AZURE_WEBAPP_PUBLISH_PROFILE` = contents of the publish profile file

The workflow `.github/workflows/azure-webapp-deploy.yml` deploys on push to `main`.

### 4. Redeploy

Push to `main` or run **Actions** → **Deploy to Azure Web App** → **Run workflow**.

---

## Updating the app after code changes

Rebuild and push a new image:

```powershell
az acr build --registry acraprimodamdcae01 --image aprimo-dam-mcp:latest .
```

Then restart the Web App:

```powershell
az webapp restart --name aprimo-dam-mcp --resource-group rg-aprimo-dam-mcp
```

Or in Portal → Web App → **Overview** → **Restart**.

---

## Optional — Connect GitHub for auto-deploy

1. Web App → **Deployment Center**
2. Source: **GitHub**
3. Organization/repo: `dcaelopre/ts-aprimodam-api-mcp`
4. Branch: `main`
5. Build provider: **GitHub Actions** or **Azure Container Registry** (build from Dockerfile)

If using GitHub Actions, you can adapt the existing workflow to deploy to Web App instead of Container Apps.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| App won't start / 503 | Check **Log stream** under Monitoring. Confirm `WEBSITES_PORT=3000` is set |
| `Cannot GET /mcp` in browser | Normal — `/mcp` requires an MCP client session, not a browser |
| Aprimo auth errors | Verify the three `APRIMO_*` environment variables |
| Image pull fails | Enable ACR admin user; check Web App → Container settings → registry credentials |
| Slow cold start | Upgrade from F1/B1 or enable **Always On** (requires B1+) |

---

## Web App vs Container Apps

| | Web App (this guide) | Container Apps |
|--|---------------------|----------------|
| Setup | Manual in Portal | Bicep + script |
| URL | `*.azurewebsites.net` | `*.azurecontainerapps.io` |
| Best for | Simple single-container hosting | Scale-to-zero, microservices |

Both work for this MCP server.
