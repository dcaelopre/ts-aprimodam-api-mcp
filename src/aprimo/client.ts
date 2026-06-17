import type { AprimoConfig, TokenResponse } from "../config.js";

const TOKEN_REFRESH_BUFFER_MS = 60_000;

export class AprimoClient {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly config: AprimoConfig) {}

  get damBaseUrl(): string {
    return `https://${this.config.tenant}.dam.aprimo.com/api/core`;
  }

  private get tokenUrl(): string {
    return `https://${this.config.tenant}.aprimo.com/login/connect/token`;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return this.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: "api",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Aprimo authentication failed (${response.status}): ${detail}`);
    }

    const token = (await response.json()) as TokenResponse;
    if (!token.access_token) {
      throw new Error("Aprimo authentication response missing access_token");
    }
    this.accessToken = token.access_token;
    this.tokenExpiresAt = Date.now() + token.expires_in * 1000;
    return token.access_token;
  }

  async getRecord(
    recordId: string,
    selectHeaders: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const token = await this.getAccessToken();
    const url = `${this.damBaseUrl}/record/${encodeURIComponent(recordId)}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/hal+json",
      "API-VERSION": "1",
      ...selectHeaders,
    };

    const response = await fetch(url, { method: "GET", headers, signal });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Aprimo API error (${response.status}) for record ${recordId}: ${detail}`);
    }

    return response.json();
  }
}
