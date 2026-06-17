export interface AprimoConfig {
  tenant: string;
  clientId: string;
  clientSecret: string;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Resolve Aprimo credentials from MCP request headers (preferred for mcp-remote clients)
 * or fall back to server environment variables.
 */
export function resolveAprimoConfig(headers: Record<string, string | string[] | undefined>): AprimoConfig {
  const tenant =
    headerValue(headers["x-aprimo-environment"]) ?? process.env.APRIMO_TENANT;
  const clientId =
    headerValue(headers["x-aprimo-client-id"]) ?? process.env.APRIMO_CLIENT_ID;
  const clientSecret =
    headerValue(headers["x-aprimo-client-secret"]) ?? process.env.APRIMO_CLIENT_SECRET;

  const missing = [
    !tenant && "X-Aprimo-Environment / APRIMO_TENANT",
    !clientId && "X-Aprimo-Client-Id / APRIMO_CLIENT_ID",
    !clientSecret && "X-Aprimo-Client-Secret / APRIMO_CLIENT_SECRET",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Missing Aprimo credentials: ${missing.join(", ")}. ` +
        "Pass them as HTTP headers via mcp-remote, or set server environment variables.",
    );
  }

  return {
    tenant: tenant!,
    clientId: clientId!,
    clientSecret: clientSecret!,
  };
}

/** @deprecated Use resolveAprimoConfig for header-aware resolution */
export function loadConfig(): AprimoConfig {
  return resolveAprimoConfig({});
}
