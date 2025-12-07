import { getDiscoveredDatasources } from '@qwery/extensions-sdk';

export async function loader() {
  try {
    const datasources = await getDiscoveredDatasources();
    return Response.json({
      datasources: datasources.map((ds) => ({
        id: ds.id,
        name: ds.name,
        description: ds.description,
        icon: ds.icon,
        packageName: ds.packageName,
        drivers: ds.drivers.map((driver) => ({
          id: driver.id,
          name: driver.name,
          description: driver.description,
          runtime: driver.runtime,
          entry: driver.entry,
        })),
        schema: ds.rawSchema,
      })),
    });
  } catch (error) {
    console.error('[extensions-api] registry error', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Registry error' },
      { status: 500 },
    );
  }
}
