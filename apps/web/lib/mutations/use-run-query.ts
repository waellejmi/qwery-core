import { useMutation } from '@tanstack/react-query';

import {
  type Datasource,
  DatasourceKind,
  type DatasourceResultSet,
} from '@qwery/domain/entities';
import { getExtension } from '@qwery/extensions-sdk';

type RunQueryPayload = {
  cellId: number;
  query: string;
  datasourceId: string;
  datasource: Datasource;
};

export function useRunQuery(
  onSuccess: (result: DatasourceResultSet, cellId: number) => void,
  onError: (error: Error, cellId: number) => void,
) {
  return useMutation({
    mutationFn: async (
      payload: RunQueryPayload,
    ): Promise<DatasourceResultSet> => {
      const { query, datasource } = payload;

      if (!query.trim()) {
        throw new Error('Query cannot be empty');
      }

      if (!datasource.datasource_provider) {
        throw new Error(
          `Datasource ${datasource.id} is missing datasource_provider`,
        );
      }

      if (datasource.datasource_kind !== DatasourceKind.EMBEDDED) {
        throw new Error('Only embedded datasources are supported');
      }

      const extension = await getExtension(datasource.datasource_provider);
      if (!extension) {
        throw new Error('Extension not found');
      }

      const driverStorageKey =
        (datasource.config as { storageKey?: string })?.storageKey ??
        datasource.id ??
        datasource.slug ??
        datasource.name;
      const driver = await extension.getDriver(
        driverStorageKey,
        datasource.config,
      );
      if (!driver) {
        throw new Error('Driver not found');
      }

      const result = await driver.query(query, datasource.config);
      return {
        rows: result.rows,
        headers: result.columns,
        stat: result.stat ?? {
          rowsAffected: 0,
          rowsRead: result.rows.length,
          rowsWritten: 0,
          queryDurationMs: null,
        },
      };
    },
    onSuccess: (result, variables) => {
      onSuccess(result, variables.cellId);
    },
    onError: (error, variables) => {
      onError(
        error instanceof Error ? error : new Error('Unknown error'),
        variables.cellId,
      );
    },
  });
}
