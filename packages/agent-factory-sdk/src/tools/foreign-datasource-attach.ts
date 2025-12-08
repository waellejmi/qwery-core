import type { Datasource } from '@qwery/domain/entities';
import type { SimpleSchema } from '@qwery/domain/entities';

export interface ForeignDatasourceAttachOptions {
  dbPath: string;
  datasource: Datasource;
}

export interface AttachResult {
  attachedDatabaseName: string;
  tables: Array<{
    schema: string;
    table: string;
    path: string;
    schemaDefinition?: SimpleSchema;
  }>;
}

/**
 * Attach a foreign database to DuckDB and create views
 * Supports PostgreSQL, MySQL, SQLite, etc. via DuckDB foreign data wrappers
 */
export async function attachForeignDatasource(
  opts: ForeignDatasourceAttachOptions,
): Promise<AttachResult> {
  const { dbPath, datasource } = opts;

  const { DuckDBInstance } = await import('@duckdb/node-api');
  const instance = await DuckDBInstance.create(dbPath);
  const conn = await instance.connect();

  try {
    const provider = datasource.datasource_provider.toLowerCase();
    const config = datasource.config as Record<string, unknown>;
    const tablesInfo: AttachResult['tables'] = [];

    // Generate a unique database name for this datasource attachment
    const attachedDatabaseName = `ds_${datasource.id.replace(/-/g, '_')}`;

    // Install and load the appropriate extension
    let attachQuery: string;

    switch (provider) {
      case 'postgresql':
      case 'neon':
      case 'supabase': {
        await conn.run('INSTALL postgres');
        await conn.run('LOAD postgres');

        const pgConnectionUrl = config.connectionUrl as string;
        if (!pgConnectionUrl) {
          throw new Error(
            'PostgreSQL datasource requires connectionUrl in config',
          );
        }

        attachQuery = `ATTACH '${pgConnectionUrl.replace(/'/g, "''")}' AS ${attachedDatabaseName} (TYPE POSTGRES)`;
        break;
      }

      case 'mysql': {
        await conn.run('INSTALL mysql');
        await conn.run('LOAD mysql');

        const mysqlHost = (config.host as string) || 'localhost';
        const mysqlPort = (config.port as number) || 3306;
        const mysqlUser = (config.user as string) || 'root';
        const mysqlPassword = (config.password as string) || '';
        const mysqlDatabase = (config.database as string) || '';

        const mysqlConnectionString = `host=${mysqlHost} port=${mysqlPort} user=${mysqlUser} password=${mysqlPassword} database=${mysqlDatabase}`;
        attachQuery = `ATTACH '${mysqlConnectionString.replace(/'/g, "''")}' AS ${attachedDatabaseName} (TYPE MYSQL)`;
        break;
      }

      case 'sqlite': {
        const sqlitePath =
          (config.path as string) || (config.connectionUrl as string);
        if (!sqlitePath) {
          throw new Error(
            'SQLite datasource requires path or connectionUrl in config',
          );
        }

        attachQuery = `ATTACH '${sqlitePath.replace(/'/g, "''")}' AS ${attachedDatabaseName}`;
        break;
      }

      default: {
        throw new Error(
          `Foreign database type not supported: ${provider}. Supported types: postgresql, mysql, sqlite`,
        );
      }
    }

    // Attach the foreign database
    try {
      await conn.run(attachQuery);
      console.debug(
        `[ForeignDatasourceAttach] Attached ${attachedDatabaseName} on file: ${dbPath}`,
      );
    } catch (error) {
      // If already attached, that's okay
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (
        !errorMsg.includes('already attached') &&
        !errorMsg.includes('already exists')
      ) {
        throw error;
      }
    }

    // Get list of tables from the attached database
    // Query information_schema to get tables
    let tablesQuery: string;
    if (
      provider === 'postgresql' ||
      provider === 'neon' ||
      provider === 'supabase'
    ) {
      tablesQuery = `
        SELECT table_schema, table_name
        FROM ${attachedDatabaseName}.information_schema.tables
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name
      `;
    } else if (provider === 'mysql') {
      tablesQuery = `
        SELECT table_schema, table_name
        FROM ${attachedDatabaseName}.information_schema.tables
        WHERE table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
        AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name
      `;
    } else {
      // SQLite
      tablesQuery = `
        SELECT 'main' as table_schema, name as table_name
        FROM ${attachedDatabaseName}.sqlite_master
        WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `;
    }

    const tablesReader = await conn.runAndReadAll(tablesQuery);
    await tablesReader.readAll();
    const tables = tablesReader.getRowObjectsJS() as Array<{
      table_schema: string;
      table_name: string;
    }>;

    // Create views for each table
    for (const table of tables) {
      const schemaName = table.table_schema || 'main';
      const tableName = table.table_name;

      // Skip system/internal schemas and tables
      const systemSchemas = [
        'information_schema',
        'pg_catalog',
        'pg_toast',
        'supabase_migrations',
        'vault',
        'storage',
        'realtime',
        'graphql',
        'graphql_public',
        'auth', // Supabase auth schema
        'extensions', // PostgreSQL extensions schema
        'pgbouncer', // Connection pooler schema
      ];
      if (systemSchemas.includes(schemaName.toLowerCase())) {
        continue;
      }

      // Skip system tables
      if (
        tableName.startsWith('pg_') ||
        tableName.startsWith('_') ||
        tableName.includes('_migrations') ||
        tableName.includes('_secrets')
      ) {
        continue;
      }

      try {
        // Generate semantic view name
        // Use attached database path directly (no view creation)
        const escapedSchemaName = schemaName.replace(/"/g, '""');
        const escapedTableName = tableName.replace(/"/g, '""');
        const escapedDbName = attachedDatabaseName.replace(/"/g, '""');
        const tablePath = `${attachedDatabaseName}.${schemaName}.${tableName}`;

        // Test if we can access the table directly
        try {
          await conn.run(
            `SELECT 1 FROM "${escapedDbName}"."${escapedSchemaName}"."${escapedTableName}" LIMIT 1`,
          );
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          // Check if it's a permission or access error
          const isPermissionError =
            errorMsg.includes('permission') ||
            errorMsg.includes('access') ||
            errorMsg.includes('denied') ||
            errorMsg.includes('does not exist') ||
            errorMsg.includes('relation');

          if (isPermissionError) {
            console.debug(
              `[ForeignDatasourceAttach] Skipping table ${schemaName}.${tableName} (${errorMsg})`,
            );
          } else {
            console.warn(
              `[ForeignDatasourceAttach] Cannot access table ${schemaName}.${tableName}: ${errorMsg}`,
            );
          }
          // Skip this table and continue with others
          continue;
        }

        // Extract schema directly from the attached table (for optional diagnostics)
        let schema: SimpleSchema | undefined;
        try {
          const describeQuery = `DESCRIBE "${escapedDbName}"."${escapedSchemaName}"."${escapedTableName}"`;
          const describeReader = await conn.runAndReadAll(describeQuery);
          await describeReader.readAll();
          const describeRows = describeReader.getRowObjectsJS() as Array<{
            column_name: string;
            column_type: string;
            null: string;
          }>;

          schema = {
            databaseName: schemaName,
            schemaName,
            tables: [
              {
                tableName,
                columns: describeRows.map((col) => ({
                  columnName: col.column_name,
                  columnType: col.column_type,
                })),
              },
            ],
          };
        } catch {
          // Non-blocking; we still expose the path
          schema = undefined;
        }

        tablesInfo.push({
          schema: schemaName,
          table: tableName,
          path: tablePath,
          schemaDefinition: schema,
        });
      } catch (error) {
        // Log error but continue with other tables
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(
          `[ForeignDatasourceAttach] Error processing table ${schemaName}.${tableName}: ${errorMsg}`,
        );
        // Continue with next table
      }
    }

    return {
      attachedDatabaseName,
      tables: tablesInfo,
    };
  } finally {
    conn.closeSync();
    instance.closeSync();
  }
}
