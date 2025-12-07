import { z } from 'zod';

export type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: string[];
  items?: JsonSchema;
  description?: string;
  format?: string;
  default?: unknown;
};

/**
 * Convert a minimal JSON Schema (v7-ish) to a Zod schema.
 * Supported: object/string/number/integer/boolean/array/enum + required.
 * Falls back to z.any() when structure is not recognised.
 */
export function jsonSchemaToZod(schema: JsonSchema): z.ZodTypeAny {
  const withDescription = <T extends z.ZodTypeAny>(
    base: T,
    description?: string,
  ) => (description ? base.describe(description) : base);

  switch (schema.type) {
    case 'string': {
      if (schema.enum && schema.enum.length > 0) {
        return withDescription(
          z.enum([...schema.enum] as [string, ...string[]]),
          schema.description,
        );
      }
      return withDescription(z.string(), schema.description);
    }
    case 'number':
    case 'integer': {
      return withDescription(z.number(), schema.description);
    }
    case 'boolean': {
      return withDescription(z.boolean(), schema.description);
    }
    case 'array': {
      const itemSchema = schema.items ? jsonSchemaToZod(schema.items) : z.any();
      return withDescription(z.array(itemSchema), schema.description);
    }
    case 'object': {
      const shapeEntries =
        schema.properties && typeof schema.properties === 'object'
          ? Object.entries(schema.properties)
          : [];
      const shape: Record<string, z.ZodTypeAny> = {};
      const required = new Set(schema.required || []);

      for (const [key, value] of shapeEntries) {
        const fieldSchema = jsonSchemaToZod(value);
        shape[key] = required.has(key) ? fieldSchema : fieldSchema.optional();
      }

      return withDescription(z.object(shape), schema.description);
    }
    default: {
      // Enum with no explicit type
      if (schema.enum && schema.enum.length > 0) {
        return withDescription(
          z.enum([...schema.enum] as [string, ...string[]]),
          schema.description,
        );
      }
      return withDescription(z.any(), schema.description);
    }
  }
}
