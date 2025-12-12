import type { IDatasourceRepository } from '@qwery/domain/repositories';
import { loadDatasources, groupDatasourcesByType } from './datasource-loader';
import { datasourceToDuckdb } from './datasource-to-duckdb';
import { attachForeignDatasource } from './foreign-datasource-attach';
import { attachGSheetDatasource } from './gsheet-to-duckdb';
import { DuckDBInstanceManager } from './duckdb-instance-manager';
import { getDatasourceDatabaseName } from './datasource-name-utils';

export interface InitializeDatasourcesOptions {
  conversationId: string;
  datasourceIds: string[];
  datasourceRepository: IDatasourceRepository;
  workspace: string;
  checkedDatasourceIds?: string[]; // For syncing state with UI
}

export interface InitializationResult {
  success: boolean;
  datasourceId: string;
  datasourceName: string;
  viewsCreated: number;
  error?: string;
}

/**
 * Initialize all datasources for a conversation
 * Creates DuckDB views for each datasource so they can be queried together
 */
export async function initializeDatasources(
  opts: InitializeDatasourcesOptions,
): Promise<InitializationResult[]> {
  const {
    conversationId,
    datasourceIds,
    datasourceRepository,
    workspace,
    checkedDatasourceIds,
  } = opts;

  if (datasourceIds.length === 0) {
    return [];
  }

  // FILTER: Only initialize checked datasources if checkedDatasourceIds provided
  const datasourcesToInitialize = checkedDatasourceIds
    ? datasourceIds.filter((id) => checkedDatasourceIds.includes(id))
    : datasourceIds;

  if (datasourcesToInitialize.length === 0) {
    return [];
  }

  // Get central instance
  const instanceWrapper = await DuckDBInstanceManager.getInstance({
    conversationId,
    workspace,
    createIfNotExists: true,
  });

  // Get connection from pool
  const conn = await DuckDBInstanceManager.getConnection(
    conversationId,
    workspace,
  );

  // Load only the datasources we're initializing
  const loaded = await loadDatasources(
    datasourcesToInitialize,
    datasourceRepository,
  );
  const { duckdbNative, foreignDatabases } = groupDatasourcesByType(loaded);

  // Separate Google Sheets from other foreign databases
  const gsheetDatasources = foreignDatabases.filter(
    (ds) => ds.datasource.datasource_provider === 'gsheet-csv',
  );
  const otherForeignDatabases = foreignDatabases.filter(
    (ds) => ds.datasource.datasource_provider !== 'gsheet-csv',
  );

  const results: InitializationResult[] = [];

  try {
    // Initialize DuckDB-native datasources using same connection
    for (const { datasource } of duckdbNative) {
      try {
        // Create views for file-based datasources (csv/json/parquet)
        const result = await datasourceToDuckdb({
          connection: conn,
          datasource,
        });

        // Register view in instance wrapper
        instanceWrapper.viewRegistry.set(datasource.id, result.viewName);

        results.push({
          success: true,
          datasourceId: datasource.id,
          datasourceName: datasource.name,
          viewsCreated: 1,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(
          `[DatasourceInitializer] Failed to initialize DuckDB-native datasource ${datasource.id}:`,
          errorMsg,
        );
        results.push({
          success: false,
          datasourceId: datasource.id,
          datasourceName: datasource.name,
          viewsCreated: 0,
          error: errorMsg,
        });
      }
    }

    // Initialize Google Sheets datasources in parallel
    const gsheetPromises = gsheetDatasources.map(async ({ datasource }) => {
      try {
        // Attach Google Sheets as database (extract schema to generate semantic names)
        const attachResult = await attachGSheetDatasource({
          connection: conn,
          datasource,
          extractSchema: true, // Need schema to generate semantic table names
        });

        // Register attachment in instance wrapper
        // Note: Even if database was already attached (shared name), we still register this datasource
        instanceWrapper.attachedDatasources.add(datasource.id);

        return {
          success: true,
          datasourceId: datasource.id,
          datasourceName: datasource.name,
          viewsCreated: attachResult.tables.length,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(
          `[DatasourceInitializer] Failed to initialize Google Sheets datasource ${datasource.id}:`,
          errorMsg,
        );
        // Even if initialization fails, if the database is already attached (shared name),
        // we should still register the datasource
        const dbName = getDatasourceDatabaseName(datasource);
        try {
          const dbListReader = await conn.runAndReadAll(
            `SELECT name FROM pragma_database_list WHERE name = '${dbName.replace(/'/g, "''")}'`,
          );
          await dbListReader.readAll();
          const existingDbs = dbListReader.getRowObjectsJS() as Array<{
            name: string;
          }>;
          if (existingDbs.length > 0) {
            // Database is already attached, register this datasource anyway
            instanceWrapper.attachedDatasources.add(datasource.id);
            return {
              success: true,
              datasourceId: datasource.id,
              datasourceName: datasource.name,
              viewsCreated: 0, // No new tables created, but datasource is registered
            };
          }
        } catch {
          // Ignore check errors
        }
        return {
          success: false,
          datasourceId: datasource.id,
          datasourceName: datasource.name,
          viewsCreated: 0,
          error: errorMsg,
        };
      }
    });

    // Initialize other foreign databases in parallel (OPTIMIZATION)
    const foreignDbPromises = otherForeignDatabases.map(
      async ({ datasource }) => {
        try {
          // Attach foreign database (skip schema extraction during init for speed)
          const attachResult = await attachForeignDatasource({
            connection: conn,
            datasource,
            extractSchema: false, // Don't need schema during init - saves time
          });

          // Register attachment in instance wrapper
          instanceWrapper.attachedDatasources.add(datasource.id);

          return {
            success: true,
            datasourceId: datasource.id,
            datasourceName: datasource.name,
            viewsCreated: attachResult.tables.length,
          };
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[DatasourceInitializer] Failed to initialize foreign datasource ${datasource.id}:`,
            errorMsg,
          );
          return {
            success: false,
            datasourceId: datasource.id,
            datasourceName: datasource.name,
            viewsCreated: 0,
            error: errorMsg,
          };
        }
      },
    );

    // Execute all foreign database attachments in parallel
    const [gsheetResults, foreignDbResults] = await Promise.all([
      Promise.all(gsheetPromises),
      Promise.all(foreignDbPromises),
    ]);
    results.push(...gsheetResults, ...foreignDbResults);

    // REMOVE: The syncDatasources call - we already initialized only checked ones
    // If checkedDatasourceIds was provided, we only initialized those
    // If not provided, we initialized all (backward compatibility)
  } finally {
    // Return connection to pool (don't close)
    DuckDBInstanceManager.returnConnection(conversationId, workspace, conn);
  }

  return results;
}
