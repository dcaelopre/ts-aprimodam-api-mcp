import type { AprimoClient } from "./client.js";

const SMALL_FILE_LIMIT_BYTES = 20 * 1024 * 1024;
const SEGMENT_SIZE_BYTES = 20 * 1024 * 1024;

export interface UploadResult {
  token: string;
  sasUrl?: string;
}

interface SegmentInitResponse {
  uri: string;
  token?: string;
}

export async function uploadFileToAprimo(
  client: AprimoClient,
  fileName: string,
  fileBuffer: Buffer,
  contentType?: string,
  signal?: AbortSignal,
): Promise<UploadResult> {
  if (fileBuffer.byteLength <= SMALL_FILE_LIMIT_BYTES) {
    return uploadSmallFile(client, fileName, fileBuffer, contentType, signal);
  }
  return uploadSegmentedFile(client, fileName, fileBuffer, contentType, signal);
}

async function uploadSmallFile(
  client: AprimoClient,
  fileName: string,
  fileBuffer: Buffer,
  contentType?: string,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(fileBuffer)], {
    type: contentType ?? "application/octet-stream",
  });
  form.append("file1", blob, fileName);

  const response = await client.uploadRequest("POST", "/uploads", { body: form, signal });
  return parseUploadResponse(response);
}

async function uploadSegmentedFile(
  client: AprimoClient,
  fileName: string,
  fileBuffer: Buffer,
  contentType?: string,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const init = (await client.uploadRequest("POST", "/uploads/segments", {
    body: { filename: fileName },
    signal,
  })) as SegmentInitResponse;

  if (!init.uri) {
    throw new Error("Aprimo upload service did not return a segment upload URI");
  }

  const segments = splitBuffer(fileBuffer, SEGMENT_SIZE_BYTES);
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;
    const form = new FormData();
    const blob = new Blob([new Uint8Array(segment)], {
      type: contentType ?? "application/octet-stream",
    });
    form.append(`segment${index}`, blob, `${fileName}.segment${index}`);

    await client.uploadRequest("POST", `${init.uri}?index=${index}`, {
      body: form,
      signal,
    });
  }

  const response = await client.uploadRequest("POST", `${init.uri}/commit`, {
    body: {
      filename: fileName,
      segmentcount: String(segments.length),
    },
    signal,
  });

  return parseUploadResponse(response);
}

function splitBuffer(buffer: Buffer, segmentSize: number): Buffer[] {
  const segments: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += segmentSize) {
    segments.push(buffer.subarray(offset, offset + segmentSize));
  }
  return segments;
}

function parseUploadResponse(response: unknown): UploadResult {
  const data = response as { token?: string; sasUrl?: string };
  if (!data.token) {
    throw new Error(`Aprimo upload response missing token: ${JSON.stringify(response)}`);
  }
  return { token: data.token, sasUrl: data.sasUrl };
}
