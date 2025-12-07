import { describe, expect, it } from 'vitest';

import { makeDriver } from '../src/driver';
import { createExtensionContext, datasources } from '../src/qwery';
import { DatasourceMetadataZodSchema } from '../src/metadata';

const sampleConfig = { filePath: '/tmp/mock.csv', delimiter: ',' };

const driverFactory = makeDriver(() => {
  return {
    async testConnection(config: unknown) {
      const parsed = config as typeof sampleConfig;
      if (!parsed.filePath) {
        throw new Error('missing filePath');
      }
    },
    async metadata() {
      return DatasourceMetadataZodSchema.parse({
        version: '0.0.1',
        driver: 'csv.local.node.test',
        schemas: [{ id: 1, name: 'public', owner: 'local' }],
        tables: [
          {
            id: 1,
            schema: 'public',
            name: 'csv_local_test',
            rls_enabled: false,
            rls_forced: false,
            bytes: 0,
            size: '0',
            live_rows_estimate: 2,
            dead_rows_estimate: 0,
            comment: null,
            primary_keys: [],
            relationships: [],
          },
        ],
        columns: [
          {
            id: '1:name',
            table_id: 1,
            schema: 'public',
            table: 'csv_local_test',
            name: 'name',
            ordinal_position: 1,
            data_type: 'text',
            format: 'text',
            is_identity: false,
            identity_generation: null,
            is_generated: false,
            is_nullable: true,
            is_updatable: true,
            is_unique: false,
            check: null,
            default_value: null,
            enums: [],
            comment: null,
          },
        ],
      });
    },
    async query() {
      return {
        columns: [
          { name: 'name', displayName: 'name', originalType: null },
          { name: 'age', displayName: 'age', originalType: null },
        ],
        rows: [
          { name: 'alice', age: '30' },
          { name: 'bob', age: '25' },
        ],
        stat: {
          rowsAffected: 2,
          rowsRead: 2,
          rowsWritten: 0,
          queryDurationMs: null,
        },
      };
    },
    async close() {
      return;
    },
  };
});

describe('extensions-sdk driver registration', () => {
  it('registers a driver and executes lifecycle methods', async () => {
    const context = createExtensionContext();
    const disposable = datasources.registerDriver(
      'csv.local.node.test',
      driverFactory,
      'node',
    );
    context.subscriptions.push(disposable);

    const registration = datasources.getDriverRegistration(
      'csv.local.node.test',
    );
    expect(registration?.runtime).toBe('node');

    const driver = registration?.factory({ runtime: 'node' });
    expect(driver).toBeDefined();

    await expect(driver?.testConnection(sampleConfig)).resolves.toBeUndefined();
    const metadata = await driver!.metadata(sampleConfig);
    expect(metadata.tables[0]?.name).toBe('csv_local_test');

    const result = await driver!.query('select * from csv', sampleConfig);
    expect(result.rows).toHaveLength(2);
    expect(result.columns.map((c) => c.name)).toEqual(['name', 'age']);

    disposable.dispose();
    expect(
      datasources.getDriverRegistration('csv.local.node.test'),
    ).toBeUndefined();
  });
});
