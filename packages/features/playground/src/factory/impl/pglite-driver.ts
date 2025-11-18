import { PGlite } from '@electric-sql/pglite';

import { DatasourceDriver, DatasourceResultSet } from '@qwery/extensions-sdk';
import type { SimpleSchema } from '@qwery/domain/entities';
import { formatSchemaForLLM } from '../../utils/schema-formatter';

export class PGliteDriver extends DatasourceDriver {
  private db: PGlite | null = null;

  constructor(name: string, config: Record<string, unknown> | string) {
    super(name, config);
  }

  async getCurrentSchema(): Promise<string | null> {
    if (!this.db) {
      await this.connect();
    }

    try {
      // Get database name
      const dbResult = await this.db!.query(
        'SELECT current_database() as database_name',
      );
      const databaseName =
        (dbResult.rows[0] as { database_name: string })?.database_name ||
        this.name;

      // Get schema name (default to 'public')
      const schemaName = 'public';

      // Get all tables in the public schema
      const tablesResult = await this.db!.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      const tables: SimpleSchema['tables'] = [];

      for (const tableRow of tablesResult.rows) {
        const tableName = (tableRow as { table_name: string }).table_name;

        // Get columns for each table
        const columnsResult = await this.db!.query(
          `
          SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `,
          [tableName],
        );

        const columns = columnsResult.rows.map((col) => {
          const colData = col as {
            column_name: string;
            data_type: string;
            character_maximum_length: number | null;
            numeric_precision: number | null;
            numeric_scale: number | null;
          };

          let columnType = colData.data_type;

          // Format column type with length/precision if applicable
          if (colData.character_maximum_length) {
            columnType = `${columnType}(${colData.character_maximum_length})`;
          } else if (
            colData.numeric_precision !== null &&
            colData.numeric_scale !== null
          ) {
            columnType = `${columnType}(${colData.numeric_precision},${colData.numeric_scale})`;
          } else if (colData.numeric_precision !== null) {
            columnType = `${columnType}(${colData.numeric_precision})`;
          }

          return {
            columnName: colData.column_name,
            columnType,
          };
        });

        tables.push({
          tableName,
          columns,
        });
      }

      const schema: SimpleSchema = {
        databaseName,
        schemaName,
        tables,
      };

      // Convert to readable string format for LLM
      const schemaString = formatSchemaForLLM(schema);

      return schemaString;
    } catch (error) {
      console.error('Error getting schema:', error);
      return null;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.db) {
        const tempDb = new PGlite(`idb://${this.name}`);
        await tempDb.waitReady;
        await tempDb.close();
      }
      return true;
    } catch (error) {
      console.error('PGlite connection test failed:', error);
      return false;
    }
  }

  async connect(): Promise<void> {
    if (this.db) {
      return;
    }

    this.db = new PGlite(`idb://${this.name}`);
    await this.db.waitReady;
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  async query(query: string): Promise<DatasourceResultSet> {
    if (!this.db) {
      await this.connect();
    }

    const startTime = performance.now();

    try {
      const result = await this.db!.query(query);
      const endTime = performance.now();

      // Transform PGlite result to DatasourceResultSet format
      const headers = result.fields.map((field) => ({
        name: field.name,
        displayName: field.name,
        originalType: field.dataTypeID?.toString() ?? null,
        originalName: field.name,
      }));

      const rows = result.rows.map((row) => {
        if (Array.isArray(row)) {
          // Handle array-based rows
          const rowData: Record<string, unknown> = {};
          result.fields.forEach((field, index) => {
            rowData[field.name] = row[index];
          });
          return rowData;
        } else {
          // Handle object-based rows (already in correct format)
          return row as Record<string, unknown>;
        }
      });

      return {
        rows,
        headers,
        stat: {
          rowsAffected: result.affectedRows ?? 0,
          rowsRead: rows.length,
          rowsWritten: result.affectedRows ?? 0,
          queryDurationMs: endTime - startTime,
        },
      };
    } catch (error) {
      throw new Error(
        `Query execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
