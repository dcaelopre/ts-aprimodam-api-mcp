import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AprimoClient, CreateRecordPayload, FieldUpdate, UpdateRecordPayload } from "../aprimo/client.js";

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

const fieldUpdateSchema = z.object({
  field_id: z.string().describe("Aprimo field GUID"),
  value: z.string().describe("Field value to set"),
  language_id: z
    .string()
    .optional()
    .describe("Language GUID for the value (required for localized fields if not using default)"),
});

function toFieldUpdates(
  fields: Array<{ field_id: string; value: string; language_id?: string }>,
): FieldUpdate[] {
  return fields.map((field) => ({
    fieldId: field.field_id,
    localizedValues: [
      {
        languageId: field.language_id ?? "00000000000000000000000000000000",
        value: field.value,
      },
    ],
  }));
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

  server.registerTool(
    "create_record",
    {
      description:
        "Create a new Aprimo DAM record (asset). Optionally attach a master file using an upload token from the Aprimo upload service, and set metadata fields. Returns the created record including its new ID.",
      inputSchema: {
        content_type: z
          .string()
          .default("Asset")
          .describe("Aprimo content type name (e.g. Asset)"),
        status: z
          .string()
          .default("Draft")
          .describe("Initial record status (e.g. Draft, Released)"),
        master_file_upload_token: z
          .string()
          .optional()
          .describe("Upload token from Aprimo upload service to attach as master file"),
        master_file_name: z
          .string()
          .optional()
          .describe("File name when attaching a master file upload token"),
        fields: z
          .array(fieldUpdateSchema)
          .optional()
          .describe("Metadata fields to set on the new record"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ content_type, status, master_file_upload_token, master_file_name, fields }, extra) => {
      const payload: CreateRecordPayload = {
        contentType: content_type,
        status,
      };

      if (fields?.length) {
        payload.fields = { addOrUpdate: toFieldUpdates(fields) };
      }

      if (master_file_upload_token) {
        payload.files = {
          master: master_file_upload_token,
          addOrUpdate: [
            {
              versions: {
                addOrUpdate: [
                  {
                    id: master_file_upload_token,
                    ...(master_file_name ? { fileName: master_file_name } : {}),
                  },
                ],
              },
            },
          ],
        };
      }

      const data = await aprimo.createRecord(payload, extra.signal);
      return jsonResult(data);
    },
  );

  server.registerTool(
    "update_record",
    {
      description:
        "Update an existing Aprimo DAM record (asset). Can change status and/or metadata field values. Only include the properties you want to change.",
      inputSchema: {
        record_id: z.string().describe("The Aprimo record GUID or identifier"),
        status: z
          .string()
          .optional()
          .describe("New record status (e.g. Draft, Released)"),
        fields: z
          .array(fieldUpdateSchema)
          .optional()
          .describe("Metadata fields to add or update on the record"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ record_id, status, fields }, extra) => {
      const payload: UpdateRecordPayload = {};

      if (status) {
        payload.status = status;
      }
      if (fields?.length) {
        payload.fields = { addOrUpdate: toFieldUpdates(fields) };
      }

      if (!status && !fields?.length) {
        throw new Error("Provide at least one of status or fields to update.");
      }

      const data = await aprimo.updateRecord(record_id, payload, extra.signal);
      return jsonResult(data);
    },
  );
}
