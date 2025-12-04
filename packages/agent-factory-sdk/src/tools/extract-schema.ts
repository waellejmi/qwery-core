import type { SimpleSchema, Table, Column } from '@qwery/domain/entities';

export interface ExtractSchemaOptions {
  dbPath: string;
  viewName?: string;
}

export const extractSchema = async (
  opts: ExtractSchemaOptions,
): Promise<SimpleSchema> => {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const instance = await DuckDBInstance.create(opts.dbPath);
  const conn = await instance.connect();

  try {
    // If no viewName specified, get all views
    if (!opts.viewName) {
      const viewsReader = await conn.runAndReadAll(`
        SELECT table_name 
        FROM information_schema.views 
        WHERE table_schema = 'main'
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT LIKE 'sqlite_%'
        AND table_name NOT LIKE '\\_%' ESCAPE '\\'
        ORDER BY table_name
      `);
      await viewsReader.readAll();
      const allViews = viewsReader.getRowObjectsJS() as Array<{
        table_name: string;
      }>;

      // Filter out known system views - only return views that look like user-created views
      // User-created views typically don't start with system prefixes and are simple names
      const systemViewPrefixes = [
        'pg_',
        'sqlite_',
        'information_schema',
        'duckdb_',
        'main.',
        'temp.',
        'pg_catalog',
        'pg_toast',
      ];
      const views = allViews.filter((v) => {
        const name = v.table_name.toLowerCase();
        // Exclude system views
        if (systemViewPrefixes.some((prefix) => name.startsWith(prefix))) {
          return false;
        }
        // Exclude views with dots (schema-qualified) or special characters
        if (name.includes('.') || name.includes('$') || name.includes('#')) {
          return false;
        }
        // Exclude views that are clearly system/internal (check for common patterns)
        const systemPatterns = [
          /^pg_/,
          /^sqlite_/,
          /^duckdb_/,
          /^information_schema/,
          /^main\./,
          /^temp\./,
          /^pg_catalog/,
          /^pg_toast/,
        ];
        if (systemPatterns.some((pattern) => pattern.test(name))) {
          return false;
        }
        return true;
      });

      // If we still have too many views, try to identify user-created ones
      // by checking if they match common naming patterns (e.g., sheet_*, my_*, etc.)
      // For now, just return all filtered views and let the caller handle it

      const tables: Table[] = [];
      for (const view of views) {
        const viewName = view.table_name.replace(/"/g, '""');
        const schemaReader = await conn.runAndReadAll(`DESCRIBE "${viewName}"`);
        await schemaReader.readAll();
        const schemaRows = schemaReader.getRowObjectsJS() as Array<{
          column_name: string;
          column_type: string;
        }>;

        const columns: Column[] = schemaRows.map((row) => ({
          columnName: row.column_name,
          columnType: row.column_type,
        }));

        tables.push({
          tableName: view.table_name,
          columns,
        });
      }

      return {
        databaseName: 'google_sheet',
        schemaName: 'google_sheet',
        tables,
      };
    }

    // Get schema information using DESCRIBE on the specific view
    const viewName = opts.viewName.replace(/"/g, '""');
    const schemaReader = await conn.runAndReadAll(`DESCRIBE "${viewName}"`);
    await schemaReader.readAll();
    const schemaRows = schemaReader.getRowObjectsJS() as Array<{
      column_name: string;
      column_type: string;
    }>;

    // Convert to SimpleSchema format
    const columns: Column[] = schemaRows.map((row) => ({
      columnName: row.column_name,
      columnType: row.column_type,
    }));

    const table: Table = {
      tableName: opts.viewName,
      columns,
    };

    const schema: SimpleSchema = {
      databaseName: 'google_sheet',
      schemaName: 'google_sheet',
      tables: [table],
    };

    return schema;
  } finally {
    conn.closeSync();
    instance.closeSync();
  }
};
