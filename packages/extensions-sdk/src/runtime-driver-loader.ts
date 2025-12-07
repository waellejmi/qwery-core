import { datasources, createExtensionContext } from './qwery';
import type { DiscoveredDriver } from './manifest-discovery';
import type { DriverFactory, DriverRuntime, DriverContext } from './types';

const loadedEntries = new Set<string>();

const isBrowser =
  typeof window !== 'undefined' && typeof document !== 'undefined';

export interface LoadDriverOptions {
  driver: DiscoveredDriver;
  instanceName: string;
}

export async function loadDriverFactory(
  driver: DiscoveredDriver,
): Promise<DriverFactory> {
  const registration = await ensureDriverRegistered(driver);
  if (!registration?.factory) {
    throw new Error(`Driver ${driver.id} did not register a factory`);
  }
  return registration.factory;
}

export async function loadDriverInstance(
  driver: DiscoveredDriver,
  _instanceName: string,
): Promise<ReturnType<DriverFactory>> {
  const factory = await loadDriverFactory(driver);
  const context: DriverContext = { runtime: driver.runtime };
  return factory(context);
}

function resolveEntry(driver: DiscoveredDriver): string {
  const entry = driver.entry ?? './dist/extension.js';
  if (isBrowser) {
    if (driver.runtime === 'node') {
      throw new Error(
        `Driver ${driver.id} is node-only and cannot be loaded in the browser.`,
      );
    }
    const fileName = basename(entry);
    return `/extensions/${driver.id}/${fileName}`;
  }
  return resolvePath(driver.packageDir, entry);
}

async function ensureDriverRegistered(driver: DiscoveredDriver) {
  const existing = datasources.getDriverRegistration(driver.id);
  if (existing) return existing;

  const entryPath = resolveEntry(driver);

  // Avoid double-import
  if (!loadedEntries.has(entryPath)) {
    loadedEntries.add(entryPath);
    const mod = await importModule(entryPath, driver.runtime);

    // If module exposes activate, run it so it can register drivers.
    if (typeof mod.activate === 'function') {
      const ctx = createExtensionContext();
      await mod.activate(ctx);
    }

    // Attempt auto-registration fallback
    let factoryCandidate: unknown =
      (mod as Record<string, unknown>).driverFactory ??
      (mod as Record<string, unknown>).makeDriver ??
      (mod as Record<string, unknown>).default;

    // If factory not found but module exposes a single function, use it
    if (!factoryCandidate) {
      const fn = Object.values(mod).find(
        (value) => typeof value === 'function',
      );
      factoryCandidate = fn;
    }

    if (typeof factoryCandidate === 'function') {
      datasources.registerDriver(
        driver.id,
        factoryCandidate as DriverFactory,
        driver.runtime ?? 'node',
      );
    }
  }

  return datasources.getDriverRegistration(driver.id);
}

async function importModule(entryPath: string, runtime: DriverRuntime) {
  if (isBrowser || runtime === 'browser') {
    return import(/* @vite-ignore */ entryPath);
  }
  const { pathToFileURL } = await import('node:url');
  const url = pathToFileURL(entryPath).href;
  return import(url);
}

function basename(target: string): string {
  const parts = target.split(/[/\\]/);
  return parts[parts.length - 1] || target;
}

function resolvePath(base: string, relative: string): string {
  const normalizedBase = base.replace(/\\/g, '/').replace(/\/$/, '');
  const normalizedRelative = relative.replace(/\\/g, '/').replace(/^\.\//, '');
  return `${normalizedBase}/${normalizedRelative}`;
}
