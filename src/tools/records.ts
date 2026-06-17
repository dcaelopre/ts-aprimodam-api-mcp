import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AprimoClient } from "../aprimo/client.js";

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerRecordTools(server: McpServer, aprimo: AprimoClient): void {
  server.registerTool(
    "get_record",
    {
      description:
        "Read an Aprimo DAM record (asset) by ID. Returns core record metadata such as title, status, content type, and timestamps. Use get_record_fields or get_record_files for metadata and file details.",
      inputSchema: {
        record_id: z.string().describe("The Aprimo record GUID or identifier"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ record_id }, extra) => {
      const data = await aprimo.getRecord(
        record_id,
        { "select-record": "title,status,contenttype,createdon,modifiedon,masterfilelatestversion" },
        extra.signal,
      );
      return jsonResult(data);
    },
  );

  server.registerTool(
    "get_record_fields",
    {
      description:
        "Read metadata fields for an Aprimo DAM record. Returns all field values by default. Optionally filter to specific fields or field groups by name or GUID.",
      inputSchema: {
        record_id: z.string().describe("The Aprimo record GUID or identifier"),
        field_names: z
          .array(z.string())
          .optional()
          .describe("Optional list of field names or GUIDs to include (omit for all fields)"),
        field_group_names: z
          .array(z.string())
          .optional()
          .describe("Optional list of field group names or GUIDs to include"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ record_id, field_names, field_group_names }, extra) => {
      const headers: Record<string, string> = { "select-record": "fields" };

      if (field_names?.length) {
        headers["select-record-fields"] = field_names.join(", ");
      }
      if (field_group_names?.length) {
        headers["select-record-fieldgroups"] = field_group_names.join(", ");
      }

      const data = await aprimo.getRecord(record_id, headers, extra.signal);
      return jsonResult(data);
    },
  );

  server.registerTool(
    "get_record_files",
    {
      description:
        "Read files attached to an Aprimo DAM record, including the master file and any additional file versions. Optionally expand file versions and renditions for download links.",
      inputSchema: {
        record_id: z.string().describe("The Aprimo record GUID or identifier"),
        include_renditions: z
          .boolean()
          .default(false)
          .describe("When true, includes file version renditions (e.g. previews, public links)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ record_id, include_renditions }, extra) => {
      const headers: Record<string, string> = {
        "select-record": "files,masterfile,masterfilelatestversion",
        "select-file": "latestversion,fileversions",
      };

      if (include_renditions) {
        headers["select-fileversion"] = "renditions,filetype";
        headers["select-rendition"] = "publiclinks";
      } else {
        headers["select-fileversion"] = "filetype";
      }

      const data = await aprimo.getRecord(record_id, headers, extra.signal);
      return jsonResult(data);
    },
  );
}
