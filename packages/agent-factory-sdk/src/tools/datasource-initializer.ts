import type { IDatasourceRepository } from '@qwery/domain/repositories';
import { loadDatasources, groupDatasourcesByType } from './datasource-loader';
import { datasourceToDuckdb } from './datasource-to-duckdb';
import { attachForeignDatasource } from './foreign-datasource-attach';

export interface InitializeDatasourcesOptions {
  conversationId: string;
  datasourceIds: string[];
  datasourceRepository: IDatasourceRepository;
  workspace: string;
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
  const { conversationId, datasourceIds, datasourceRepository, workspace } =
    opts;

  if (datasourceIds.length === 0) {
    return [];
  }

  const { join } = await import('node:path');
  const { mkdir } = await import('node:fs/promises');

  const fileDir = join(workspace, conversationId);
  await mkdir(fileDir, { recursive: true });
  const dbPath = join(fileDir, 'database.db');

  // Load all datasources
  const loaded = await loadDatasources(datasourceIds, datasourceRepository);
  const { duckdbNative, foreignDatabases } = groupDatasourcesByType(loaded);

  const results: InitializationResult[] = [];

  // Initialize DuckDB-native datasources
  for (const { datasource } of duckdbNative) {
    try {
      // Create views for file-based datasources (csv/gsheet-csv/json/parquet)
      await datasourceToDuckdb({
        dbPath,
        datasource,
      });

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

  // Initialize foreign databases
  for (const { datasource } of foreignDatabases) {
    try {
      // Attach foreign database (no view registry)
      const attachResult = await attachForeignDatasource({
        dbPath,
        datasource,
      });

      results.push({
        success: true,
        datasourceId: datasource.id,
        datasourceName: datasource.name,
        viewsCreated: attachResult.tables.length,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `[DatasourceInitializer] Failed to initialize foreign datasource ${datasource.id}:`,
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

  return results;
}
