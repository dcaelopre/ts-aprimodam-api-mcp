import type { AprimoConfig, TokenResponse } from "../config.js";

const TOKEN_REFRESH_BUFFER_MS = 60_000;

export interface LocalizedFieldValue {
  languageId: string;
  value: string;
}

export interface FieldUpdate {
  fieldId: string;
  localizedValues: LocalizedFieldValue[];
}

export interface CreateRecordPayload {
  status?: string;
  contentType?: string;
  fields?: { addOrUpdate: FieldUpdate[] };
  files?: {
    master?: string;
    addOrUpdate?: Array<{
      versions: {
        addOrUpdate: Array<{
          id: string;
          fileName?: string;
        }>;
      };
    }>;
  };
}

export interface UpdateRecordPayload {
  status?: string;
  fields?: { addOrUpdate: FieldUpdate[] };
}

export class AprimoClient {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly config: AprimoConfig) {}

  get damBaseUrl(): string {
    return `https://${this.config.tenant}.dam.aprimo.com/api/core`;
  }

  get uploadBaseUrl(): string {
    return `https://${this.config.tenant}.aprimo.com`;
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

  private async apiRequest(
    method: string,
    path: string,
    options: {
      selectHeaders?: Record<string, string>;
      body?: unknown;
      signal?: AbortSignal;
    } = {},
  ): Promise<unknown> {
    const token = await this.getAccessToken();
    const url = `${this.damBaseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/hal+json",
      "API-VERSION": "1",
      ...options.selectHeaders,
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Aprimo API error (${response.status}) ${method} ${path}: ${detail}`);
    }

    const text = await response.text();
    if (!text) {
      return { success: true };
    }

    return JSON.parse(text);
  }

  async getRecord(
    recordId: string,
    selectHeaders: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.apiRequest("GET", `/record/${encodeURIComponent(recordId)}`, {
      selectHeaders,
      signal,
    });
  }

  async createRecord(payload: CreateRecordPayload, signal?: AbortSignal): Promise<unknown> {
    return this.apiRequest("POST", "/records", {
      body: payload,
      selectHeaders: { "select-record": "title,status,contenttype,fields" },
      signal,
    });
  }

  async updateRecord(
    recordId: string,
    payload: UpdateRecordPayload,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.apiRequest("PUT", `/record/${encodeURIComponent(recordId)}`, {
      body: payload,
      signal,
    });
  }

  async uploadRequest(
    method: string,
    path: string,
    options: { body?: FormData | unknown; signal?: AbortSignal } = {},
  ): Promise<unknown> {
    const token = await this.getAccessToken();
    const url = `${this.uploadBaseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "*/*",
      "api-version": "1",
    };

    let body: BodyInit | undefined;
    if (options.body instanceof FormData) {
      body = options.body;
    } else if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: options.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Aprimo upload error (${response.status}) ${method} ${path}: ${detail}`);
    }

    const text = await response.text();
    if (!text) {
      return { success: true };
    }

    return JSON.parse(text);
  }
}
