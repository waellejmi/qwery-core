import { describe, it, expect, beforeEach } from 'vitest';
import {
  analyzeSchemaAndUpdateContext,
  loadBusinessContext,
} from '../../src/services/business-context.service';
import type { SimpleSchema } from '@qwery/domain/entities';
import { join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';

describe('BusinessContextService', () => {
  const testDir = join(process.cwd(), 'test-business-context');

  beforeEach(async () => {
    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
    await mkdir(testDir, { recursive: true });
  });

  it('should create business context from a single schema', async () => {
    const schema: SimpleSchema = {
      databaseName: 'test',
      schemaName: 'test',
      tables: [
        {
          tableName: 'users',
          columns: [
            { columnName: 'id', columnType: 'BIGINT' },
            { columnName: 'name', columnType: 'VARCHAR' },
            { columnName: 'email', columnType: 'VARCHAR' },
          ],
        },
      ],
    };

    const context = await analyzeSchemaAndUpdateContext(
      testDir,
      'users',
      schema,
    );

    expect(context).toBeDefined();
    expect(context.entities.size).toBeGreaterThan(0);
    expect(context.vocabulary.size).toBeGreaterThan(0);
    expect(context.domain).toBe('general');
    expect(context.views.has('users')).toBe(true);
  });

  it('should detect relationships between multiple views', async () => {
    // First view
    const schema1: SimpleSchema = {
      databaseName: 'test',
      schemaName: 'test',
      tables: [
        {
          tableName: 'users',
          columns: [
            { columnName: 'id', columnType: 'BIGINT' },
            { columnName: 'name', columnType: 'VARCHAR' },
          ],
        },
      ],
    };

    await analyzeSchemaAndUpdateContext(testDir, 'users', schema1);

    // Second view with common column
    const schema2: SimpleSchema = {
      databaseName: 'test',
      schemaName: 'test',
      tables: [
        {
          tableName: 'orders',
          columns: [
            { columnName: 'id', columnType: 'BIGINT' },
            { columnName: 'user_id', columnType: 'BIGINT' },
            { columnName: 'total', columnType: 'DOUBLE' },
          ],
        },
      ],
    };

    const context = await analyzeSchemaAndUpdateContext(
      testDir,
      'orders',
      schema2,
    );

    expect(context.relationships.length).toBeGreaterThan(0);
    expect(context.entityGraph.size).toBeGreaterThan(0);
  });

  it('should persist and load business context', async () => {
    const schema: SimpleSchema = {
      databaseName: 'test',
      schemaName: 'test',
      tables: [
        {
          tableName: 'products',
          columns: [
            { columnName: 'id', columnType: 'BIGINT' },
            { columnName: 'name', columnType: 'VARCHAR' },
          ],
        },
      ],
    };

    await analyzeSchemaAndUpdateContext(testDir, 'products', schema);

    const loaded = await loadBusinessContext(testDir);

    expect(loaded).toBeDefined();
    expect(loaded?.views.has('products')).toBe(true);
    expect(loaded?.entities.size).toBeGreaterThan(0);
  });
});
