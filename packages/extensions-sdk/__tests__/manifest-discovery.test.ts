import { describe, expect, it } from 'vitest';

import {
  discoverExtensions,
  getDiscoveredDatasource,
} from '../src/manifest-discovery';

describe('manifest discovery', () => {
  it('discovers datasources from manifests', async () => {
    const all = await discoverExtensions();
    expect(all.length).toBeGreaterThan(0);
  });

  it('maps drivers to datasources', async () => {
    const ds = await getDiscoveredDatasource('postgresql');
    expect(ds?.drivers[0]?.id).toBe('postgresql.default');
  });
});
