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

export function loadConfig(): AprimoConfig {
  const tenant = process.env.APRIMO_TENANT;
  const clientId = process.env.APRIMO_CLIENT_ID;
  const clientSecret = process.env.APRIMO_CLIENT_SECRET;

  const missing = [
    !tenant && "APRIMO_TENANT",
    !clientId && "APRIMO_CLIENT_ID",
    !clientSecret && "APRIMO_CLIENT_SECRET",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return { tenant: tenant!, clientId: clientId!, clientSecret: clientSecret! };
}
