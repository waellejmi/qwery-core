import { z } from 'zod';

import { jsonSchemaToZod, type JsonSchema } from './json-schema-to-zod';
import { ExtensionScope, type DriverRuntime } from './types';

const PackageJsonSchema = z.object({
  name: z.string(),
  version: z.string(),
  main: z.string().optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  contributes: z
    .object({
      datasources: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().optional(),
            icon: z.string().optional(),
            schema: z.record(z.any()),
            drivers: z.array(z.string()).optional(),
          }),
        )
        .optional(),
      drivers: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().optional(),
            runtime: z.enum(['node', 'browser']).optional(),
            entry: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export interface DiscoveredDriver {
  id: string;
  name: string;
  description?: string;
  runtime: DriverRuntime;
  entry?: string;
  packageDir: string;
}

export interface DiscoveredDatasource {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  schema: z.ZodTypeAny;
  rawSchema: JsonSchema;
  drivers: DiscoveredDriver[];
  packageDir: string;
  packageName: string;
  scope: ExtensionScope;
}

export interface DiscoveredExtensionPackage {
  packageName: string;
  packageDir: string;
  datasources: DiscoveredDatasource[];
  drivers: DiscoveredDriver[];
}

const _DEFAULT_EXTENSIONS_DIR: string | null = null; // Resolved lazily on server only

const isBrowser =
  typeof window !== 'undefined' && typeof document !== 'undefined';

let discoveryCache: DiscoveredExtensionPackage[] | null = null;

export async function discoverExtensions(
  extensionsRoot?: string | null,
): Promise<DiscoveredExtensionPackage[]> {
  if (discoveryCache) return discoveryCache;

  if (isBrowser) {
    discoveryCache = await loadFromClientRegistry();
    return discoveryCache;
  }

  const root = extensionsRoot ?? (await resolveDefaultExtensionsDir());

  const exists = await dirExists(root);
  if (!exists) {
    discoveryCache = [];
    return discoveryCache;
  }

  const fs = await getFs();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const packages: DiscoveredExtensionPackage[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = await getPath();
    const pkgDir = path.join(root, entry.name);
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!(await fileExists(pkgJsonPath))) continue;

    const pkgRaw = await fs.readFile(pkgJsonPath, 'utf8');
    let parsed;
    try {
      parsed = PackageJsonSchema.parse(JSON.parse(pkgRaw));
    } catch (error) {
      // Skip invalid manifests but continue discovering others
      console.warn(
        `[extensions-sdk] Skipping extension at ${pkgDir}: invalid package.json (${(error as Error).message})`,
      );
      continue;
    }

    const drivers =
      parsed.contributes?.drivers?.map<DiscoveredDriver>((driver) => ({
        id: driver.id,
        name: driver.name,
        description: driver.description,
        runtime: driver.runtime ?? 'node',
        entry: driver.entry ?? parsed.main ?? './dist/extension.js',
        packageDir: pkgDir,
      })) ?? [];

    const datasources =
      parsed.contributes?.datasources?.map<DiscoveredDatasource>((ds) => {
        const schema = ds.schema as JsonSchema;
        return {
          id: ds.id,
          name: ds.name,
          description: ds.description,
          icon: ds.icon,
          schema: jsonSchemaToZod(schema),
          rawSchema: schema,
          drivers:
            (ds.drivers
              ?.map((driverId) => drivers.find((d) => d.id === driverId))
              .filter(Boolean) as DiscoveredDriver[]) ?? [],
          packageDir: pkgDir,
          packageName: parsed.name,
          scope: ExtensionScope.DATASOURCE,
        };
      }) ?? [];

    packages.push({
      packageName: parsed.name,
      packageDir: pkgDir,
      datasources,
      drivers,
    });
  }

  discoveryCache = packages;
  return packages;
}

export async function getDiscoveredDatasource(
  datasourceId: string,
): Promise<DiscoveredDatasource | undefined> {
  const all = await discoverExtensions();
  for (const ext of all) {
    const found = ext.datasources.find((ds) => ds.id === datasourceId);
    if (found) return found;
  }
  return undefined;
}

export async function getDiscoveredDatasources(): Promise<
  DiscoveredDatasource[]
> {
  const all = await discoverExtensions();
  return all.flatMap((pkg) => pkg.datasources);
}

async function dirExists(target: string): Promise<boolean> {
  const fs = await getFs();
  try {
    const stat = await fs.stat(target);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(target: string): Promise<boolean> {
  const fs = await getFs();
  try {
    const stat = await fs.stat(target);
    return stat.isFile();
  } catch {
    return false;
  }
}

// Browser-side registry loader (expects build step to emit registry.json)
async function loadFromClientRegistry(): Promise<DiscoveredExtensionPackage[]> {
  try {
    const res = await fetch('/extensions/registry.json');
    if (!res.ok) return [];
    const payload = (await res.json()) as {
      datasources: Array<{
        id: string;
        name: string;
        description?: string;
        icon?: string;
        schema: JsonSchema;
        packageName: string;
        packageDir?: string;
        drivers: Array<{
          id: string;
          name: string;
          description?: string;
          runtime?: DriverRuntime;
          entry?: string;
        }>;
      }>;
    };

    const datasources: DiscoveredDatasource[] =
      payload.datasources?.map((ds) => ({
        id: ds.id,
        name: ds.name,
        description: ds.description,
        icon: ds.icon,
        rawSchema: ds.schema,
        schema: jsonSchemaToZod(ds.schema),
        drivers:
          ds.drivers?.map((driver) => ({
            id: driver.id,
            name: driver.name,
            description: driver.description,
            runtime: driver.runtime ?? 'browser',
            entry: driver.entry,
            packageDir: ds.packageDir ?? '',
          })) ?? [],
        packageDir: ds.packageDir ?? '',
        packageName: ds.packageName,
        scope: ExtensionScope.DATASOURCE,
      })) ?? [];

    return [
      {
        packageName: 'registry',
        packageDir: '',
        datasources,
        drivers: datasources.flatMap((d) => d.drivers),
      },
    ];
  } catch (error) {
    console.warn(
      '[extensions-sdk] Unable to load client registry',
      (error as Error).message,
    );
    return [];
  }
}

async function getFs() {
  const mod = await import('node:fs/promises');
  return mod.default ?? mod;
}

async function getPath() {
  const mod = await import('node:path');
  return mod.default ?? mod;
}

async function resolveDefaultExtensionsDir(): Promise<string> {
  const path = await getPath();
  if (typeof __dirname !== 'undefined') {
    return path.resolve(__dirname, '..', '..', 'extensions');
  }
  const { fileURLToPath } = await import('node:url');
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, '..', '..', 'extensions');
}
