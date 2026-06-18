const DEFAULT_BASE_FIELDS = ["Title", "Description", "Keywords"] as const;

const DIRECT_SEARCH_FIELDS = new Set<string>([
  "Title",
  "Description",
  "Keywords",
  "LatestVersionOfMasterfile.FileName",
  "ContentType",
  "Contentstatus",
  "CreatedOn",
  "ModifiedOn",
]);

export interface SearchRecordsQuery {
  keywords: string;
  baseFields?: string[];
  customFieldNames?: string[];
  customFieldIds?: string[];
  contentType?: string;
  status?: string;
  supportWildcards?: boolean;
}

function escapeSearchLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function fieldContainsClause(field: string, keyword: string): string {
  const escapedKeyword = escapeSearchLiteral(keyword);
  const fieldExpression = DIRECT_SEARCH_FIELDS.has(field)
    ? field
    : `FieldName('${field.replace(/'/g, "''")}')`;

  return `${fieldExpression} CONTAINS '${escapedKeyword}'`;
}

export function buildRecordSearchExpression(query: SearchRecordsQuery): string {
  const keyword = query.keywords.trim();
  if (!keyword) {
    throw new Error("keywords must not be empty");
  }

  const fields = [
    ...(query.baseFields?.length ? query.baseFields : [...DEFAULT_BASE_FIELDS]),
    ...(query.customFieldNames ?? []),
    ...(query.customFieldIds ?? []),
  ];

  const uniqueFields = [...new Set(fields.map((field) => field.trim()).filter(Boolean))];
  if (!uniqueFields.length) {
    throw new Error("At least one search field is required");
  }

  const fieldClauses = uniqueFields.map((field) => fieldContainsClause(field, keyword));
  const keywordExpression =
    fieldClauses.length === 1 ? fieldClauses[0]! : `(${fieldClauses.join(" OR ")})`;

  const filters: string[] = [];
  if (query.contentType) {
    filters.push(`ContentType = '${escapeSearchLiteral(query.contentType)}'`);
  }
  if (query.status) {
    filters.push(`Contentstatus = '${escapeSearchLiteral(query.status)}'`);
  }

  if (!filters.length) {
    return keywordExpression;
  }

  return `${filters.join(" AND ")} AND ${keywordExpression}`;
}
