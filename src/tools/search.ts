import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AprimoClient } from "../aprimo/client.js";
import { buildRecordSearchExpression } from "../aprimo/search.js";

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerSearchTools(server: McpServer, aprimo: AprimoClient): void {
  server.registerTool(
    "search_records",
    {
      description:
        "Search Aprimo DAM records (assets) by keywords across base metadata fields (Title, Description, Keywords) and optional custom field definitions. Returns matching record IDs and summary metadata. Use get_field_definitions to discover custom field names.",
      inputSchema: {
        keywords: z.string().describe("Keywords or phrase to search for"),
        base_fields: z
          .array(z.string())
          .optional()
          .describe(
            "Base fields to search (default: Title, Description, Keywords). Examples: Title, Description, Keywords, LatestVersionOfMasterfile.FileName",
          ),
        custom_field_names: z
          .array(z.string())
          .optional()
          .describe("Custom field definition names to include, e.g. ['ProductName', 'Campaign']"),
        custom_field_ids: z
          .array(z.string())
          .optional()
          .describe("Custom field definition GUIDs to include in the search"),
        content_type: z
          .string()
          .optional()
          .describe("Optional filter, e.g. Asset"),
        status: z
          .string()
          .optional()
          .describe("Optional content status filter, e.g. Released or Draft"),
        page: z.number().int().min(1).default(1).describe("Results page number"),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(50)
          .describe("Number of results per page"),
        support_wildcards: z
          .boolean()
          .default(true)
          .describe("When true, allows * wildcards in keywords"),
      },
      annotations: { readOnlyHint: true },
    },
    async (
      {
        keywords,
        base_fields,
        custom_field_names,
        custom_field_ids,
        content_type,
        status,
        page,
        page_size,
        support_wildcards,
      },
      extra,
    ) => {
      const expression = buildRecordSearchExpression({
        keywords,
        baseFields: base_fields,
        customFieldNames: custom_field_names,
        customFieldIds: custom_field_ids,
        contentType: content_type,
        status,
        supportWildcards: support_wildcards,
      });

      const data = await aprimo.searchRecords({
        expression,
        page,
        pageSize: page_size,
        supportWildcards: support_wildcards,
        signal: extra.signal,
      });

      return jsonResult({
        search_expression: expression,
        results: data,
      });
    },
  );
}
