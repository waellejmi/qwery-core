import {
  getDiscoveredDatasource,
  getDiscoveredDatasources,
  type DiscoveredDriver,
} from './manifest-discovery';
import { loadDriverInstance } from './runtime-driver-loader';
import type { DatasourceExtension, ExtensionMetadata } from './types';
import { ExtensionScope } from './types';

// Legacy holder to keep API surface stable; not used for discovery.
const legacyExtensions = new Map<string, DatasourceExtension>();

export function registerExtension(extension: DatasourceExtension): void {
  legacyExtensions.set(extension.id, extension);
}

function pickDriver(drivers: DiscoveredDriver[], config: unknown) {
  const cfg = config as { driverId?: string } | undefined;
  if (cfg?.driverId) {
    const match = drivers.find((d) => d.id === cfg.driverId);
    if (match) return match;
  }

  const browserPreferred =
    typeof window !== 'undefined' &&
    drivers.find((d) => d.runtime === 'browser');
  if (browserPreferred) return browserPreferred;

  return drivers[0];
}

function normalizeIconPath(
  icon: string | undefined,
  datasourceId: string,
): string {
  if (!icon) return '';
  // If already an absolute path (starts with /), return as is
  if (icon.startsWith('/')) return icon;
  // If relative path, convert to public path
  const filename = icon.split('/').pop() || icon;
  return `/extensions/${datasourceId}/${filename}`;
}

export async function getExtension(
  id: string,
): Promise<DatasourceExtension | undefined> {
  const ds = await getDiscoveredDatasource(id);
  if (!ds) return undefined;

  const drivers = ds.drivers;

  return {
    id: ds.id,
    name: ds.name,
    logo: normalizeIconPath(ds.icon, ds.id),
    description: ds.description,
    tags: [],
    scope: ds.scope,
    schema: ds.schema,
    getDriver: async (instanceName: string, config: unknown) => {
      const driver = pickDriver(drivers, config);
      if (!driver) {
        throw new Error(`No driver configured for datasource ${ds.id}`);
      }
      return loadDriverInstance(driver, instanceName);
    },
  };
}

export async function getAllExtensions(): Promise<DatasourceExtension[]> {
  const datasources = await getDiscoveredDatasources();
  const extensions = await Promise.all(
    datasources.map((ds) => getExtension(ds.id)),
  );
  return extensions.filter(Boolean) as DatasourceExtension[];
}

export async function getExtensionMetadata(
  id: string,
): Promise<ExtensionMetadata | undefined> {
  const ds = await getDiscoveredDatasource(id);
  if (!ds) return undefined;
  return {
    id: ds.id,
    name: ds.name,
    logo: normalizeIconPath(ds.icon, ds.id),
    description: ds.description,
    tags: [],
    scope: ds.scope ?? ExtensionScope.DATASOURCE,
    schema: ds.schema,
  };
}

export async function getAllExtensionMetadata(): Promise<ExtensionMetadata[]> {
  const datasources = await getDiscoveredDatasources();
  return datasources.map((ds) => ({
    id: ds.id,
    name: ds.name,
    logo: normalizeIconPath(ds.icon, ds.id),
    description: ds.description,
    tags: [],
    scope: ds.scope ?? ExtensionScope.DATASOURCE,
    schema: ds.schema,
  }));
}
