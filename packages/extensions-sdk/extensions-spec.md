Extensions SDK v0: smallest possible contract to register datasources + drivers, collect metadata, and run queries. Keep it simple, no extra plumbing beyond what’s needed for first integrations.

## Package manifest (package.json)
- Top-level: `name`, `version`, `main` (built JS entry), `displayName?`, `description?`, `categories?`, `keywords?`, `icon?`.
- `"dependencies": { "@qwery/extensions-sdk": "workspace:*" }`
- `"contributes"` block:
  - `datasources`: array of datasource definitions
    - `id`: string slug, globally unique (e.g. `csv.gsheet`)
    - `name`: short display label
    - `description`: short help text
    - `icon?`: relative path in the extension package
    - `schema`: JSON Schema (v7-ish) object for user config. Frontend renders it; values are persisted by core. Sensitive fields: set `format: "password"`; SDK stores them in secure storage.
    - `drivers`: array of driver ids (strings) that can back this datasource. If you omit, the datasource is informational-only.
  - `drivers`: array of driver definitions
    - `id`: string slug (match the ids referenced by datasources)
    - `name`: display label
    - `description`: short help text
    - `runtime`: `"node"` | `"browser"` (default: `"node"`)
    - `entry?`: optional override path; defaults to `main`

## Activation file (extension.ts)
- Must export `activate(context: qwery.ExtensionContext)`.
- Use `context.subscriptions.push` to register drivers.
- Types come from `qwery` (provided via `packages/extensions-sdk/qwery-dts/qwery.d.ts`).

```typescript
import * as qwery from "qwery";
import { makeDriver } from "./driver";

export function activate(context: qwery.ExtensionContext) {
  context.subscriptions.push(
    qwery.datasources.registerDriver("csv.gsheet.duckdb", makeDriver)
  );
}
```

## Driver shape (v0)
Factory signature: `(context: qwery.DriverContext) => IDataSourceDriver`.

```typescript
export interface IDataSourceDriver {
  testConnection(config: unknown): Promise<void>;
  query(sql: string, config: unknown): Promise<qwery.QueryResult>;
  metadata(config: unknown): Promise<qwery.DatasourceMetadata>;
  close?(): Promise<void>;
}
```

- `config` is the user config validated from the datasource `schema`. Secrets are resolved from secure storage before invocation.
- `metadata` must return the core schema from `@domain/entities/datasource-meta` (`DatasourceMetadataZodSchema`). Schemas are `.passthrough()`, so you can include engine-specific fields without redefining them.
- `query` returns rows and columns; use SDK `QueryResult` shape.
- Optional helpers exposed via `DriverContext`: logging, secure storage access, cancellation token (TBD).

## Metadata expectations
- Use the core, vendor-neutral schemas under `packages/domain/src/entities/datasource-meta`.
- RLS flags and policies are first-class; keep them intact when you return table metadata.
- You can extend any schema with engine-specific fields; avoid mutating core types.

## Minimal example manifest
```json
{
  "name": "@example/qwery-csv",
  "version": "0.0.1",
  "main": "./dist/extension.js",
  "contributes": {
    "datasources": [
      {
        "id": "csv.gsheet",
        "name": "Google Sheet CSV",
        "description": "Connect to Google Sheet via CSV export",
        "schema": {
          "type": "object",
          "properties": {
            "sharedLink": { "type": "string", "description": "Sheet share URL" },
            "apiKey": { "type": "string", "format": "password" }
          },
          "required": ["sharedLink"]
        },
        "drivers": ["csv.gsheet.duckdb"]
      }
    ],
    "drivers": [
      { "id": "csv.gsheet.duckdb", "name": "DuckDB CSV", "runtime": "browser" }
    ]
  },
  "dependencies": {
    "@qwery/extensions-sdk": "workspace:*"
  }
}
```

## Runtime notes
- Extensions can run in Node or browser; declare per driver with `runtime`.
- Multiple drivers can power one datasource (e.g., Node PG + browser DuckDB); pick driver per execution policy in the host (future).
- Keep v0 lean: no activation events, no configuration outside the datasource schema, no commands/events registry yet.