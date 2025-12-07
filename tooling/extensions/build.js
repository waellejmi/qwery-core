const fs = require('node:fs/promises');
const path = require('node:path');

const here = __dirname;

const extensionsRoot = path.resolve(
  here,
  '..',
  '..',
  'packages',
  'extensions',
);

const publicRoot = path.resolve(
  here,
  '..',
  '..',
  'apps',
  'web',
  'public',
  'extensions',
);

async function main() {
  await fs.rm(publicRoot, { recursive: true, force: true });
  await fs.mkdir(publicRoot, { recursive: true });

  const registry = { datasources: [] };
  const entries = await safeReaddir(extensionsRoot);

  for (const entry of entries) {
    const pkgDir = path.join(extensionsRoot, entry);
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!(await fileExists(pkgJsonPath))) continue;

    const pkg = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8'));
    const contributes = pkg.contributes ?? {};
    const drivers = contributes.drivers ?? [];
    const datasources = contributes.datasources ?? [];

    for (const ds of datasources) {
      const dsDrivers = (ds.drivers ?? [])
        .map((id) => drivers.find((d) => d.id === id))
        .filter(Boolean);

      const driverDescriptors = [];
      for (const driver of dsDrivers) {
        const entryFile =
          driver.entry ?? pkg.main ?? './dist/extension.js';
        const runtime = driver.runtime ?? 'node';

        let copiedEntry;
        if (runtime === 'browser') {
          const sourcePath = path.resolve(pkgDir, entryFile);
          if (await fileExists(sourcePath)) {
            const driverOutDir = path.join(publicRoot, driver.id);
            await fs.mkdir(driverOutDir, { recursive: true });
            const dest = path.join(driverOutDir, path.basename(entryFile));
            await fs.copyFile(sourcePath, dest);
            copiedEntry = path.basename(entryFile);
          } else {
            console.warn(
              `[extensions-build] Missing entry for browser driver ${driver.id} at ${sourcePath}`,
            );
          }
        }

        driverDescriptors.push({
          id: driver.id,
          name: driver.name,
          description: driver.description,
          runtime,
          ...(copiedEntry ? { entry: copiedEntry } : {}),
        });
      }

      // Copy icon if present
      let iconPath;
      if (ds.icon) {
        const iconSourcePath = path.resolve(pkgDir, ds.icon);
        if (await fileExists(iconSourcePath)) {
          const iconDestDir = path.join(publicRoot, ds.id);
          await fs.mkdir(iconDestDir, { recursive: true });
          const iconDest = path.join(iconDestDir, path.basename(ds.icon));
          await fs.copyFile(iconSourcePath, iconDest);
          // Path relative to /extensions/ for browser access
          iconPath = `/extensions/${ds.id}/${path.basename(ds.icon)}`;
        } else {
          console.warn(
            `[extensions-build] Icon not found for datasource ${ds.id} at ${iconSourcePath}`,
          );
        }
      }

      registry.datasources.push({
        id: ds.id,
        name: ds.name,
        description: ds.description,
        icon: iconPath,
        schema: ds.schema,
        packageName: pkg.name,
        drivers: driverDescriptors,
      });
    }
  }

  const registryPath = path.join(publicRoot, 'registry.json');
  await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));
  console.log(`[extensions-build] Registry written to ${registryPath}`);
}

async function safeReaddir(target) {
  try {
    return await fs.readdir(target);
  } catch (error) {
    console.warn(`[extensions-build] Unable to read ${target}`, error);
    return [];
  }
}

async function fileExists(target) {
  try {
    const stat = await fs.stat(target);
    return stat.isFile();
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error('[extensions-build] failed', error);
  process.exit(1);
});

