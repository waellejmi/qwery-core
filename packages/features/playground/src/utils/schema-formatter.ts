import type { SimpleSchema } from '@qwery/domain/entities';

/**
 * Formats a SimpleSchema object into a readable string format for LLM consumption
 */
export function formatSchemaForLLM(schema: SimpleSchema): string {
  let output = `Database: ${schema.databaseName}\n`;
  output += `Schema: ${schema.schemaName}\n\n`;

  if (schema.tables.length === 0) {
    output += 'No tables found in this schema.\n';
    return output;
  }

  output += `Tables (${schema.tables.length}):\n\n`;

  for (const table of schema.tables) {
    output += `Table: ${table.tableName}\n`;
    output += `  Columns (${table.columns.length}):\n`;

    for (const column of table.columns) {
      output += `    - ${column.columnName}: ${column.columnType}\n`;
    }

    output += '\n';
  }

  return output;
}
