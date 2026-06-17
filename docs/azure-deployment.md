# Azure Deployment Guide

Deploy the Aprimo DAM MCP server to **Azure Container Apps** with **Azure Container Registry** and **GitHub Actions** CI/CD.

## Architecture

```
GitHub (main) → GitHub Actions → ACR (Docker image) → Container App → https://<app>.azurecontainerapps.io/mcp
```

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed and logged in (`az login`)
- An Azure subscription
- GitHub repo: https://github.com/dcaelopre/ts-aprimodam-api-mcp

## Step 1 — Deploy Azure infrastructure (one-time)

1. Copy the parameters file and fill in your values:

```powershell
Copy-Item infra\parameters.example.json infra\parameters.json
# Edit infra\parameters.json — set acrName (globally unique), aprimoTenant, aprimoClientId, aprimoClientSecret
```

> **Note:** `acrName` must be globally unique (letters and numbers only, e.g. `acraprimodamdcae01`). `parameters.json` is gitignored — never commit secrets.

2. Run the infrastructure script:

```powershell
.\scripts\deploy-infra.ps1
```

This creates:
- Resource group `rg-aprimo-dam-mcp`
- Azure Container Registry
- Log Analytics workspace
- Container Apps environment
- Container App with Aprimo env vars and health probes

Save the output **MCP endpoint URL** (e.g. `https://aprimo-dam-mcp.<region>.azurecontainerapps.io/mcp`).

## Step 2 — Create a GitHub Actions service principal

Run in PowerShell (replace subscription ID):

```powershell
$subscriptionId = az account show --query id -o tsv
az ad sp create-for-rbac `
  --name "github-aprimo-dam-mcp" `
  --role contributor `
  --scopes /subscriptions/$subscriptionId/resourceGroups/rg-aprimo-dam-mcp `
  --json-auth
```

Copy the entire JSON output.

## Step 3 — Add GitHub secret

In your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Value |
|--------|-------|
| `AZURE_CREDENTIALS` | Full JSON from the service principal command above |

## Step 4 — Deploy via GitHub Actions

Push to `main` (or trigger manually under **Actions** → **Deploy to Azure Container Apps** → **Run workflow**).

The workflow will:
1. Build the Docker image
2. Push to your Azure Container Registry
3. Update the Container App with the new image

## Step 5 — Verify deployment

```powershell
# Get the app URL
az containerapp show `
  --name aprimo-dam-mcp `
  --resource-group rg-aprimo-dam-mcp `
  --query properties.configuration.ingress.fqdn -o tsv
```

Test health:
```
https://<your-fqdn>/health
```

Connect MCP clients to:
```
https://<your-fqdn>/mcp
```

## Connect in Claude

Add a custom connector (Claude Desktop / Claude.ai) or in Claude Code:

```bash
claude mcp add --transport http aprimo-dam https://<your-fqdn>/mcp
```

## Updating Aprimo credentials

Change secrets in the Azure Portal:

**Container App** → **Containers** → **Environment variables**, or redeploy infrastructure:

```powershell
.\scripts\deploy-infra.ps1
```

## Customizing region or names

Edit `scripts/deploy-infra.ps1` (`$Location`, `$ResourceGroup`) and `.github/workflows/azure-deploy.yml` (`env` block) to match your `parameters.json` values.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| ACR name already taken | Choose a unique `acrName` in `parameters.json` and update `ACR_NAME` in the workflow |
| Container App shows placeholder image | Run the GitHub Actions workflow to push the real image |
| Health check fails | Check Container App logs: `az containerapp logs show -n aprimo-dam-mcp -g rg-aprimo-dam-mcp` |
| Aprimo auth errors | Verify `APRIMO_TENANT`, `APRIMO_CLIENT_ID`, `APRIMO_CLIENT_SECRET` in Container App env vars |
