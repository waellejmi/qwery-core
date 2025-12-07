# Qwery Extensions SDK v0

Minimal contracts to register datasources and drivers, collect metadata, and run queries. Schemas come from `@domain/entities/datasource-meta` (`DatasourceMetadataZodSchema`).

## Core Types
- `ExtensionContext` with `subscriptions: Disposable[]`.
- `DriverContext` with optional `logger`, `secrets`, `abortSignal`, `runtime: "node" | "browser"`.
- `IDataSourceDriver` with `testConnection`, `query`, `metadata`, optional `close`.
- `QueryResult` uses `columns`, `rows`, `stat`, `lastInsertRowid?`.
- `datasources.registerDriver(id, factory, runtime?)` returns a disposable.

## Activation example
```ts
import * as qwery from '@qwery/extensions-sdk';
import { makeDriver } from './driver';

export function activate(context: qwery.ExtensionContext) {
  context.subscriptions.push(
    qwery.datasources.registerDriver('csv.gsheet.duckdb', makeDriver),
  );
}
```

## Manifest template
See `templates/package.json` for a ready JSON sample:
- top-level `name`, `version`, `main`.
- optional `displayName`, `description`, `categories`, `keywords`, `icon`.
- `contributes.datasources[]` with `id`, `name`, `description`, `icon?`, `schema`, `drivers`.
- `contributes.drivers[]` with `id`, `name`, `description`, `runtime`, `entry?`.
- dependency on `@qwery/extensions-sdk`.

## Driver shape (v0)
Factory signature: `(context: DriverContext) => IDataSourceDriver`.
```ts
export function makeDriver(context: DriverContext): IDataSourceDriver {
  return {
    async testConnection(config) {
      // validate config and verify access; throw on failure
    },
    async metadata(config) {
      // return DatasourceMetadata (use DatasourceMetadataZodSchema.parse)
      return DatasourceMetadataZodSchema.parse({
        version: '0.0.1',
        driver: 'csv.local',
        schemas: [],
        tables: [],
        columns: [],
      });
    },
    async query(sql, config) {
      // run query; return QueryResult with columns + rows
      return {
        columns: [],
        rows: [],
        stat: { rowsAffected: 0, rowsRead: 0, rowsWritten: 0, queryDurationMs: null },
      };
    },
    async close() {
      // optional cleanup
    },
  };
}
```

## Metadata expectations
- SDK re-exports `DatasourceMetadataZodSchema` (and related types) under `@qwery/extensions-sdk/metadata`; extensions should import from there only.
- Use `DatasourceMetadataZodSchema` to validate your result; schemas are `.passthrough()`, so vendor extras are fine.
- Preserve RLS flags/policies in table metadata.
- You can add engine-specific fields without mutating core types.

## Runtime + multi-driver notes
- Drivers declare `runtime: "node" | "browser"` when registering.
- Multiple drivers can back one datasource; the host picks the execution policy.
- Secrets passed in `config` are already resolved from secure storage.

## Concrete sample
- `packages/extension/examples/csv-local/` shows a local CSV datasource/driver with tests that validate connection, metadata, and query flow against a fixture CSV.

