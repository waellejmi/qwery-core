import { useMutation } from '@tanstack/react-query';

import { Datasource } from '@qwery/domain/entities';
import { getDiscoveredDatasource, getExtension } from '@qwery/extensions-sdk';

type TestConnectionResult = {
  success: boolean;
  error?: string;
  data: {
    connected: boolean;
    message: string;
  };
};

export function useTestConnection(
  onSuccess: (result: TestConnectionResult) => void,
  onError: (error: Error) => void,
) {
  return useMutation({
    mutationFn: async (payload: Datasource) => {
      const dsMeta = await getDiscoveredDatasource(payload.datasource_provider);
      const driver =
        dsMeta?.drivers.find(
          (d) => d.id === (payload.config as { driverId?: string })?.driverId,
        ) ?? dsMeta?.drivers[0];

      const runtime = driver?.runtime ?? 'browser';

      if (runtime === 'browser') {
        const extension = await getExtension(payload.datasource_provider);
        if (!extension) {
          throw new Error('Extension not found');
        }
        const driverStorageKey =
          (payload.config as { storageKey?: string })?.storageKey ??
          payload.id ??
          payload.slug ??
          payload.name ??
          'embedded-datasource';
        const instance = await extension.getDriver(
          driverStorageKey,
          payload.config,
        );
        if (!instance) {
          throw new Error('Driver not found');
        }
        await instance.testConnection(payload.config);
        return {
          success: true,
          data: {
            connected: true,
            message: 'Connection successful',
          },
        };
      }

      const response = await fetch('/api/driver/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'testConnection',
          datasourceProvider: payload.datasource_provider,
          driverId: driver?.id,
          config: payload.config,
        }),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: 'Failed to test connection' }));
        throw new Error(error.error || 'Failed to test connection');
      }

      return response.json();
    },
    onSuccess,
    onError,
  });
}
