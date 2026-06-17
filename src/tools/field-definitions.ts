import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AprimoClient } from "../aprimo/client.js";

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerFieldDefinitionTools(server: McpServer, aprimo: AprimoClient): void {
  server.registerTool(
    "get_field_definitions",
    {
      description:
        "List Aprimo DAM field definitions (metadata schema). Returns field IDs, names, data types, labels, and field groups. Use a field_definition_id to fetch one definition, or filter/paginate the catalog.",
      inputSchema: {
        field_definition_id: z
          .string()
          .optional()
          .describe("Optional field definition GUID — when set, returns a single definition"),
        page: z.number().int().min(1).default(1).describe("Page number when listing definitions"),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(50)
          .describe("Results per page when listing definitions"),
        filter: z
          .string()
          .optional()
          .describe(
            "Optional Aprimo filter expression (e.g. Name='Title'). See Aprimo REST API filter syntax.",
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ field_definition_id, page, page_size, filter }, extra) => {
      const data = field_definition_id
        ? await aprimo.getFieldDefinition(field_definition_id, extra.signal)
        : await aprimo.getFieldDefinitions({
            page,
            pageSize: page_size,
            filter,
            signal: extra.signal,
          });

      return jsonResult(data);
    },
  );
}
