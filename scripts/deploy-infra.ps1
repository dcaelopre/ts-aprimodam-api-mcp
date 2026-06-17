# Requires Azure CLI: https://learn.microsoft.com/cli/azure/install-azure-cli
# Usage:
#   1. Copy infra/parameters.example.json to infra/parameters.json and fill in values
#   2. .\scripts\deploy-infra.ps1

$ErrorActionPreference = "Stop"

$ResourceGroup = "rg-aprimo-dam-mcp"
$Location = "southeastasia"
$ParametersFile = Join-Path $PSScriptRoot "..\infra\parameters.json"
$BicepFile = Join-Path $PSScriptRoot "..\infra\main.bicep"

if (-not (Test-Path $ParametersFile)) {
    Write-Error "Missing $ParametersFile — copy parameters.example.json and fill in your values."
}

Write-Host "Creating resource group: $ResourceGroup ($Location)"
az group create --name $ResourceGroup --location $Location | Out-Null

Write-Host "Deploying Azure infrastructure..."
az deployment group create `
    --resource-group $ResourceGroup `
    --template-file $BicepFile `
    --parameters $ParametersFile `
    --output table

Write-Host ""
Write-Host "Infrastructure deployed. Next steps:"
Write-Host "  1. Add GitHub secrets (see docs/azure-deployment.md)"
Write-Host "  2. Push to main — GitHub Actions will build and deploy the container image"
