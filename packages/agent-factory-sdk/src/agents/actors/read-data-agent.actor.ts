import { z } from 'zod';
import {
  Experimental_Agent as Agent,
  convertToModelMessages,
  UIMessage,
  tool,
  validateUIMessages,
  stepCountIs,
} from 'ai';
import { fromPromise } from 'xstate/actors';
import { resolveModel } from '../../services';
import { testConnection } from '../../tools/test-connection';
import type { SimpleSchema } from '@qwery/domain/entities';
import { runQuery } from '../../tools/run-query';
import { READ_DATA_AGENT_PROMPT } from '../prompts/read-data-agent.prompt';
import type { BusinessContext } from '../../tools/types/business-context.types';
import { mergeBusinessContexts } from '../../tools/utils/business-context.storage';
import { getConfig } from '../../tools/utils/business-context.config';
import { buildBusinessContext } from '../../tools/build-business-context';
import { enhanceBusinessContextInBackground } from './enhance-business-context.actor';
import type { Repositories } from '@qwery/domain/repositories';
import { initializeDatasources } from '../../tools/datasource-initializer';
import { GetConversationBySlugService } from '@qwery/domain/services';
import {
  loadDatasources,
  groupDatasourcesByType,
} from '../../tools/datasource-loader';

// Lazy workspace resolution - only resolve when actually needed, not at module load time
// This prevents side effects when the module is imported in browser/SSR contexts
let WORKSPACE_CACHE: string | undefined;

function resolveWorkspaceDir(): string | undefined {
  const globalProcess =
    typeof globalThis !== 'undefined'
      ? (globalThis as { process?: NodeJS.Process }).process
      : undefined;
  const envValue =
    globalProcess?.env?.WORKSPACE ??
    globalProcess?.env?.VITE_WORKING_DIR ??
    globalProcess?.env?.WORKING_DIR;
  if (envValue) {
    return envValue;
  }

  try {
    return (import.meta as { env?: Record<string, string> })?.env
      ?.VITE_WORKING_DIR;
  } catch {
    return undefined;
  }
}

function getWorkspace(): string | undefined {
  if (WORKSPACE_CACHE === undefined) {
    WORKSPACE_CACHE = resolveWorkspaceDir();
  }
  return WORKSPACE_CACHE;
}

export const readDataAgent = async (
  conversationId: string,
  messages: UIMessage[],
  model: string,
  repositories?: Repositories,
) => {
  // Initialize datasources if repositories are provided
  if (repositories) {
    const workspace = getWorkspace();
    if (workspace) {
      try {
        // Get conversation to find datasources
        // Note: conversationId is actually a slug in this context
        const getConversationService = new GetConversationBySlugService(
          repositories.conversation,
        );
        const conversation =
          await getConversationService.execute(conversationId);

        if (conversation?.datasources && conversation.datasources.length > 0) {
          // Initialize all datasources
          const initResults = await initializeDatasources({
            conversationId,
            datasourceIds: conversation.datasources,
            datasourceRepository: repositories.datasource,
            workspace,
          });

          // Log initialization results for debugging
          const successful = initResults.filter((r) => r.success);
          const failed = initResults.filter((r) => !r.success);

          if (successful.length > 0) {
            console.log(
              `[ReadDataAgent] Initialized ${successful.length} datasource(s) with ${successful.reduce((sum, r) => sum + r.viewsCreated, 0)} view(s)`,
            );
          }

          if (failed.length > 0) {
            console.warn(
              `[ReadDataAgent] Failed to initialize ${failed.length} datasource(s):`,
              failed.map((f) => `${f.datasourceName} (${f.error})`).join(', '),
            );
          }
        } else {
          console.log(
            `[ReadDataAgent] No datasources found in conversation ${conversationId}`,
          );
        }
      } catch (error) {
        // Log but don't fail - datasources might not be available yet
        console.warn(
          `[ReadDataAgent] Failed to initialize datasources:`,
          error,
        );
      }
    }
  }

  const result = new Agent({
    model: await resolveModel(model),
    system: READ_DATA_AGENT_PROMPT,
    tools: {
      testConnection: tool({
        description:
          'Test the connection to the database to check if the database is accessible',
        inputSchema: z.object({}),
        execute: async () => {
          const workspace = getWorkspace();
          if (!workspace) {
            throw new Error('WORKSPACE environment variable is not set');
          }
          const { join } = await import('node:path');
          const dbPath = join(workspace, conversationId, 'database.db');
          const result = await testConnection({
            dbPath: dbPath,
          });
          return result.toString();
        },
      }),
      getSchema: tool({
        description:
          'Discover available data structures directly from DuckDB (views + attached databases). If viewName is provided, returns schema for that specific view/table (accepts fully qualified paths). If not provided, returns schemas for everything discovered in DuckDB. This updates the business context automatically.',
        inputSchema: z.object({
          viewName: z.string().optional(),
        }),
        execute: async ({ viewName }) => {
          const workspace = getWorkspace();
          if (!workspace) {
            throw new Error('WORKSPACE environment variable is not set');
          }
          const { join } = await import('node:path');
          const dbPath = join(workspace, conversationId, 'database.db');
          const fileDir = join(workspace, conversationId);

          // Helper to describe a single table/view
          const describeObject = async (
            db: string,
            schemaName: string,
            tableName: string,
          ): Promise<SimpleSchema | null> => {
            const { DuckDBInstance } = await import('@duckdb/node-api');
            const instance = await DuckDBInstance.create(dbPath);
            const conn = await instance.connect();
            try {
              const escapedDb = db.replace(/"/g, '""');
              const escapedSchema = schemaName.replace(/"/g, '""');
              const escapedTable = tableName.replace(/"/g, '""');
              const describeQuery = `DESCRIBE "${escapedDb}"."${escapedSchema}"."${escapedTable}"`;
              const reader = await conn.runAndReadAll(describeQuery);
              await reader.readAll();
              const rows = reader.getRowObjectsJS() as Array<{
                column_name: string;
                column_type: string;
              }>;
              return {
                databaseName: db,
                schemaName,
                tables: [
                  {
                    tableName,
                    columns: rows.map((row) => ({
                      columnName: row.column_name,
                      columnType: row.column_type,
                    })),
                  },
                ],
              };
            } catch {
              return null;
            } finally {
              conn.closeSync();
              instance.closeSync();
            }
          };

          // Enumerate all databases/schemas/tables/views from DuckDB
          const { DuckDBInstance } = await import('@duckdb/node-api');
          const instance = await DuckDBInstance.create(dbPath);
          const conn = await instance.connect();

          const collectedSchemas: Map<string, SimpleSchema> = new Map();

          try {
            // Re-attach foreign datasources for this connection (attachments are session-scoped)
            if (repositories) {
              try {
                const getConversationService = new GetConversationBySlugService(
                  repositories.conversation,
                );
                const conversation =
                  await getConversationService.execute(conversationId);
                if (conversation?.datasources?.length) {
                  const loaded = await loadDatasources(
                    conversation.datasources,
                    repositories.datasource,
                  );
                  const { foreignDatabases } = groupDatasourcesByType(loaded);
                  for (const { datasource } of foreignDatabases) {
                    const provider =
                      datasource.datasource_provider.toLowerCase();
                    const config = datasource.config as Record<string, unknown>;
                    const attachedDatabaseName = `ds_${datasource.id.replace(
                      /-/g,
                      '_',
                    )}`;
                    try {
                      if (
                        provider === 'postgresql' ||
                        provider === 'neon' ||
                        provider === 'supabase'
                      ) {
                        await conn.run('INSTALL postgres');
                        await conn.run('LOAD postgres');
                        const connectionUrl = config.connectionUrl as string;
                        if (!connectionUrl) continue;
                        await conn.run(
                          `ATTACH '${connectionUrl.replace(/'/g, "''")}' AS "${attachedDatabaseName}" (TYPE POSTGRES)`,
                        );
                        console.log(
                          `[ReadDataAgent] Attached ${attachedDatabaseName} with query: ${connectionUrl.replace(/'/g, "''")}`,
                        );
                      } else if (provider === 'mysql') {
                        await conn.run('INSTALL mysql');
                        await conn.run('LOAD mysql');
                        const connectionUrl =
                          (config.connectionUrl as string) ||
                          `host=${(config.host as string) || 'localhost'} port=${
                            (config.port as number) || 3306
                          } user=${(config.user as string) || 'root'} password=${
                            (config.password as string) || ''
                          } database=${(config.database as string) || ''}`;
                        await conn.run(
                          `ATTACH '${connectionUrl.replace(/'/g, "''")}' AS "${attachedDatabaseName}" (TYPE MYSQL)`,
                        );
                      } else if (provider === 'sqlite') {
                        const sqlitePath =
                          (config.path as string) ||
                          (config.connectionUrl as string);
                        if (!sqlitePath) continue;
                        await conn.run(
                          `ATTACH '${sqlitePath.replace(/'/g, "''")}' AS "${attachedDatabaseName}"`,
                        );
                      }
                    } catch (error) {
                      const msg =
                        error instanceof Error ? error.message : String(error);
                      if (
                        !msg.includes('already attached') &&
                        !msg.includes('already exists')
                      ) {
                        console.warn(
                          `[ReadDataAgent] Failed to attach datasource ${datasource.id}: ${msg}`,
                        );
                      }
                    }
                  }
                }
              } catch (error) {
                console.warn(
                  '[ReadDataAgent] attachForeignForConnection failed:',
                  error,
                );
              }
            }

            const dbReader = await conn.runAndReadAll(
              'SELECT name FROM pragma_database_list;',
            );
            await dbReader.readAll();
            const dbRows = dbReader.getRowObjectsJS() as Array<{
              name: string;
            }>;
            const databases = dbRows.map((r) => r.name);

            const targets: Array<{
              db: string;
              schema: string;
              table: string;
            }> = [];

            for (const db of databases) {
              const escapedDb = db.replace(/"/g, '""');
              const tablesReader = await conn.runAndReadAll(`
                SELECT table_schema, table_name, table_type
                FROM information_schema.tables
                WHERE table_catalog = '${escapedDb}'
                  AND table_type IN ('BASE TABLE', 'VIEW')
              `);
              await tablesReader.readAll();
              const tableRows = tablesReader.getRowObjectsJS() as Array<{
                table_schema: string;
                table_name: string;
                table_type: string;
              }>;
              for (const row of tableRows) {
                targets.push({
                  db,
                  schema: row.table_schema || 'main',
                  table: row.table_name,
                });
              }
            }

            if (viewName) {
              // Describe only the requested object
              const viewId = viewName as string;
              let db = 'main';
              let schemaName = 'main';
              let tableName = viewId;
              if (viewId.includes('.')) {
                const parts = viewId.split('.').filter(Boolean);
                if (parts.length === 3) {
                  db = parts[0] ?? db;
                  schemaName = parts[1] ?? schemaName;
                  tableName = parts[2] ?? tableName;
                } else if (parts.length === 2) {
                  schemaName = parts[0] ?? schemaName;
                  tableName = parts[1] ?? tableName;
                } else if (parts.length === 1) {
                  tableName = parts[0] ?? tableName;
                }
              }
              const schema = await describeObject(db, schemaName, tableName);
              if (!schema) {
                throw new Error(`Object "${viewId}" not found in DuckDB`);
              }
              collectedSchemas.set(viewId, schema);
            } else {
              // Describe everything discovered
              for (const target of targets) {
                const fullName = `${target.db}.${target.schema}.${target.table}`;
                const schema = await describeObject(
                  target.db,
                  target.schema,
                  target.table,
                );
                if (schema) {
                  collectedSchemas.set(fullName, schema);
                }
              }
            }
          } finally {
            conn.closeSync();
            instance.closeSync();
          }

          // Get performance configuration
          const perfConfig = await getConfig(fileDir);

          // Build schemasMap and primary schema
          const schemasMap = collectedSchemas;
          const schema = (viewName && collectedSchemas.get(viewName)) ||
            collectedSchemas.values().next().value || {
              databaseName: 'main',
              schemaName: 'main',
              tables: [],
            };

          // Build fast context (synchronous, < 100ms)
          let fastContext: BusinessContext;
          if (viewName) {
            // Single view - build fast context
            fastContext = await buildBusinessContext({
              conversationDir: fileDir,
              viewName,
              schema,
            });

            // Start enhancement in background (don't await)
            enhanceBusinessContextInBackground({
              conversationDir: fileDir,
              viewName,
              schema,
              dbPath,
            });
          } else {
            // Multiple views - build fast context for each
            const fastContexts: BusinessContext[] = [];
            for (const [vName, vSchema] of schemasMap.entries()) {
              const ctx = await buildBusinessContext({
                conversationDir: fileDir,
                viewName: vName,
                schema: vSchema,
              });
              fastContexts.push(ctx);

              // Start enhancement in background for each view
              enhanceBusinessContextInBackground({
                conversationDir: fileDir,
                viewName: vName,
                schema: vSchema,
                dbPath,
              });
            }
            // Merge all fast contexts into one
            fastContext = mergeBusinessContexts(fastContexts);
          }

          // Use fast context for immediate response
          const entities = Array.from(fastContext.entities.values()).slice(
            0,
            perfConfig.expectedViewCount * 2,
          );
          const relationships = fastContext.relationships.slice(
            0,
            perfConfig.expectedViewCount * 3,
          );
          const vocabulary = Object.fromEntries(
            Array.from(fastContext.vocabulary.entries())
              .slice(0, perfConfig.expectedViewCount * 10)
              .map(([key, entry]) => [key, entry]),
          );

          // Return schema and data insights (hide technical jargon)
          return {
            schema: schema,
            businessContext: {
              domain: fastContext.domain.domain, // Just the domain name string
              entities: entities.map((e) => ({
                name: e.name,
                columns: e.columns,
              })), // Simplified - just name and columns
              relationships: relationships.map((r) => ({
                from: r.fromView,
                to: r.toView,
                join: r.joinCondition,
              })), // Simplified - just connection info
              vocabulary: vocabulary, // Keep for internal use but don't expose structure
            },
          };
        },
      }),
      runQuery: tool({
        description:
          'Run a SQL query against the DuckDB instance (views from file-based datasources or attached database tables). Query views by name (e.g., "customers") or attached tables by full path (e.g., ds_x.public.users). DuckDB enables federated queries across PostgreSQL, MySQL, Google Sheets, and other datasources.',
        inputSchema: z.object({
          query: z.string(),
        }),
        execute: async ({ query }) => {
          const workspace = getWorkspace();
          if (!workspace) {
            throw new Error('WORKSPACE environment variable is not set');
          }
          const { join } = await import('node:path');
          const dbPath = join(workspace, conversationId, 'database.db');

          const result = await runQuery({
            dbPath,
            query,
          });

          return {
            result: result,
          };
        },
      }),
    },
    stopWhen: stepCountIs(20),
  });

  return result.stream({
    messages: convertToModelMessages(await validateUIMessages({ messages })),
    providerOptions: {
      openai: {
        reasoningSummary: 'auto', // 'auto' for condensed or 'detailed' for comprehensive
        reasoningEffort: 'medium',
        reasoningDetailedSummary: true,
        reasoningDetailedSummaryLength: 'long',
      },
    },
  });
};

export const readDataAgentActor = fromPromise(
  async ({
    input,
  }: {
    input: {
      conversationId: string;
      previousMessages: UIMessage[];
      model: string;
      repositories?: Repositories;
    };
  }) => {
    return readDataAgent(
      input.conversationId,
      input.previousMessages,
      input.model,
      input.repositories,
    );
  },
);
