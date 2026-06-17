import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AprimoClient } from "../aprimo/client.js";
import { uploadFileToAprimo } from "../aprimo/upload.js";

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

const MAX_INLINE_FILE_BYTES = 20 * 1024 * 1024;

async function loadFileBuffer(
  fileContentBase64: string | undefined,
  fileUrl: string | undefined,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (fileContentBase64) {
    return Buffer.from(fileContentBase64, "base64");
  }

  if (fileUrl) {
    const response = await fetch(fileUrl, { signal });
    if (!response.ok) {
      throw new Error(`Failed to download file from URL (${response.status}): ${fileUrl}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  throw new Error("Provide either file_content_base64 or file_url.");
}

export function registerUploadTools(server: McpServer, aprimo: AprimoClient): void {
  server.registerTool(
    "upload_file",
    {
      description:
        "Upload a file to Aprimo DAM and return an upload token. Use the token with create_record (master_file_upload_token) or record file updates. Supports files up to 20 MB inline via base64, or larger files via file_url. Each upload token can only be used once.",
      inputSchema: {
        file_name: z.string().describe("Original file name including extension (e.g. photo.jpg)"),
        file_content_base64: z
          .string()
          .optional()
          .describe("Base64-encoded file content (recommended for files up to ~20 MB)"),
        file_url: z
          .string()
          .url()
          .optional()
          .describe("Public URL to download the file from (use for larger files)"),
        content_type: z
          .string()
          .optional()
          .describe("MIME type (e.g. image/jpeg). Defaults to application/octet-stream"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ file_name, file_content_base64, file_url, content_type }, extra) => {
      const fileBuffer = await loadFileBuffer(file_content_base64, file_url, extra.signal);

      if (file_content_base64 && fileBuffer.byteLength > MAX_INLINE_FILE_BYTES) {
        throw new Error(
          `Inline upload limit is ${MAX_INLINE_FILE_BYTES} bytes. Use file_url for larger files.`,
        );
      }

      const result = await uploadFileToAprimo(
        aprimo,
        file_name,
        fileBuffer,
        content_type,
        extra.signal,
      );

      return jsonResult({
        ...result,
        file_name,
        file_size_bytes: fileBuffer.byteLength,
        message: "Upload successful. Pass token to create_record as master_file_upload_token.",
      });
    },
  );
}
