# datasource-meta (core, vendor-neutral)

- Core schemas are universal and vendor-neutral.
- RLS is a first-class capability: tables keep `rls_enabled`/`rls_forced`; `policies` are generic.
- All schemas use Zod `.passthrough()` so drivers can add engine-specific fields without touching core.
- Optional vendor-ish blocks (config, publications, roles, extensions, privileges) live in the metadata container; drivers include them only if applicable.

## Extending core schemas in a driver

Use Zod `.extend()`/`.merge()` on the exported schemas:

```ts
import { TableZodSchema } from '@domain/entities/datasource-meta';

const MyEngineTableSchema = TableZodSchema.extend({
  distribution: z.string().optional(),
  storageTier: z.enum(['hot', 'cold']).optional(),
});
```

Add custom blocks to metadata via `.passthrough()`:

```ts
import { DatasourceMetadataZodSchema } from '@domain/entities/datasource-meta';

const MyEngineMetadata = DatasourceMetadataZodSchema.extend({
  engine: z.literal('my-engine'),
  diagnostics: z.object({
    clusterHealth: z.string(),
  }),
});
```

Because core schemas already `.passthrough()`, drivers can also return extra keys directly when constructing metadata without redefining schemas.

