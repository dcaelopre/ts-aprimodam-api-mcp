@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Globally unique ACR name (letters and numbers only, 5-50 chars)')
param acrName string

@description('Container App name')
param containerAppName string = 'aprimo-dam-mcp'

@description('Aprimo tenant subdomain')
param aprimoTenant string

@description('Aprimo OAuth client ID')
@secure()
param aprimoClientId string

@description('Aprimo OAuth client secret')
@secure()
param aprimoClientSecret string

@description('Container image tag')
param imageTag string = 'latest'

var imageName = 'aprimo-dam-mcp'
var placeholderImage = 'mcr.microsoft.com/k8se/quickstart:latest'

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${containerAppName}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource containerAppEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${containerAppName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        allowInsecure: false
      }
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
        {
          name: 'aprimo-client-secret'
          value: aprimoClientSecret
        }
      ]
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
    }
    template: {
      containers: [
        {
          name: imageName
          image: imageTag == 'latest' ? placeholderImage : '${acr.properties.loginServer}/${imageName}:${imageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'HOST'
              value: '0.0.0.0'
            }
            {
              name: 'APRIMO_TENANT'
              value: aprimoTenant
            }
            {
              name: 'APRIMO_CLIENT_ID'
              value: aprimoClientId
            }
            {
              name: 'APRIMO_CLIENT_SECRET'
              secretRef: 'aprimo-client-secret'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

output acrLoginServer string = acr.properties.loginServer
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output mcpEndpoint string = 'https://${containerApp.properties.configuration.ingress.fqdn}/mcp'
