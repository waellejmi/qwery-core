import { join } from 'node:path';
import type { SimpleSchema } from '@qwery/domain/entities';

export interface BusinessEntity {
  name: string; // business concept name (e.g., "User", "Order")
  columns: string[]; // columns that represent this entity
  views: string[]; // view names containing this entity
  dataType: string; // inferred data type
  businessType: 'entity' | 'relationship' | 'attribute'; // type of business concept
}

export interface Relationship {
  fromView: string;
  toView: string;
  joinColumn: string; // common column name
  type: 'one-to-one' | 'one-to-many' | 'many-to-many' | 'unknown';
  confidence: number; // 0-1, how confident we are about this relationship
}

export interface BusinessContext {
  entities: Map<string, BusinessEntity>; // column name → business entity
  vocabulary: Map<string, string>; // technical term → business term
  relationships: Relationship[]; // detected relationships between views
  entityGraph: Map<string, string[]>; // entity → connected entities
  domain: string; // inferred business domain
  views: Map<string, ViewMetadata>; // view name → metadata
  updatedAt: string;
}

export interface ViewMetadata {
  viewName: string;
  schema: SimpleSchema;
  entities: string[]; // business entities found in this view
  lastAnalyzed: string;
}

const BUSINESS_CONTEXT_FILE = 'business-context.json';

/**
 * Infer business entity name from column name
 */
function inferBusinessEntity(columnName: string): string {
  // Remove common suffixes/prefixes
  let name = columnName.toLowerCase();

  // Remove ID suffixes
  name = name.replace(/_id$|id$/, '');

  // Remove common prefixes
  name = name.replace(/^user_|^customer_|^order_|^product_|^dept_/, '');

  // Convert snake_case to Title Case
  const words = name.split('_').filter((w) => w.length > 0);
  if (words.length === 0) return columnName;

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Detect business type from column name and data type
 */
function detectBusinessType(
  columnName: string,
  _dataType: string,
): BusinessEntity['businessType'] {
  const name = columnName.toLowerCase();

  // Relationship indicators
  if (name.endsWith('_id') || name === 'id') {
    return 'relationship';
  }

  // Entity indicators (usually primary keys or main identifiers)
  if (name === 'id' || name.includes('user') || name.includes('customer')) {
    return 'entity';
  }

  // Attributes (everything else)
  return 'attribute';
}

/**
 * Analyze a single schema to extract business entities
 */
function analyzeSchema(schema: SimpleSchema): BusinessEntity[] {
  const entities: BusinessEntity[] = [];

  for (const table of schema.tables) {
    for (const column of table.columns) {
      const entityName = inferBusinessEntity(column.columnName);
      const businessType = detectBusinessType(
        column.columnName,
        column.columnType,
      );

      entities.push({
        name: entityName,
        columns: [column.columnName],
        views: [table.tableName],
        dataType: column.columnType,
        businessType,
      });
    }
  }

  return entities;
}

/**
 * Find common columns across multiple schemas (potential relationships)
 */
function findCommonColumns(
  schemas: Array<{ viewName: string; schema: SimpleSchema }>,
): Relationship[] {
  const relationships: Relationship[] = [];
  const columnMap = new Map<string, Array<{ view: string; column: string }>>();

  // Build a map of column names to their views
  for (const { viewName, schema } of schemas) {
    for (const table of schema.tables) {
      for (const column of table.columns) {
        const colName = column.columnName.toLowerCase();
        if (!columnMap.has(colName)) {
          columnMap.set(colName, []);
        }
        columnMap
          .get(colName)!
          .push({ view: viewName, column: column.columnName });
      }
    }
  }

  // Find columns that appear in multiple views (potential relationships)
  for (const [colName, occurrences] of columnMap.entries()) {
    if (occurrences.length >= 2) {
      // This column appears in multiple views - potential relationship
      for (let i = 0; i < occurrences.length; i++) {
        for (let j = i + 1; j < occurrences.length; j++) {
          const from = occurrences[i];
          const to = occurrences[j];

          // Determine relationship type based on column name
          let type: Relationship['type'] = 'unknown';
          if (colName.endsWith('_id') || colName === 'id') {
            type = 'one-to-many'; // Foreign key relationship (one-to-many)
          }

          if (from && to) {
            relationships.push({
              fromView: from.view,
              toView: to.view,
              joinColumn: colName,
              type,
              confidence: 0.8, // High confidence for common column names
            });
          }
        }
      }
    }
  }

  return relationships;
}

/**
 * Build business vocabulary from entities
 */
function buildVocabulary(entities: BusinessEntity[]): Map<string, string> {
  const vocabulary = new Map<string, string>();

  for (const entity of entities) {
    for (const column of entity.columns) {
      // Map technical column name to business entity name
      vocabulary.set(column.toLowerCase(), entity.name);

      // Also map common variations
      const variations = [
        column.replace(/_id$/, ''),
        column.replace(/^user_/, ''),
        column.replace(/^customer_/, ''),
      ];

      for (const variation of variations) {
        if (variation && variation !== column) {
          vocabulary.set(variation.toLowerCase(), entity.name);
        }
      }
    }
  }

  return vocabulary;
}

/**
 * Build entity relationship graph
 */
function buildEntityGraph(
  entities: BusinessEntity[],
  relationships: Relationship[],
): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  // Initialize graph with all entities
  for (const entity of entities) {
    if (!graph.has(entity.name)) {
      graph.set(entity.name, []);
    }
  }

  // Add relationships to graph
  for (const rel of relationships) {
    // Find entities for the views involved in the relationship
    const fromEntities = entities.filter((e) => e.views.includes(rel.fromView));
    const toEntities = entities.filter((e) => e.views.includes(rel.toView));

    for (const fromEntity of fromEntities) {
      for (const toEntity of toEntities) {
        if (fromEntity.name !== toEntity.name) {
          const connections = graph.get(fromEntity.name) || [];
          if (!connections.includes(toEntity.name)) {
            connections.push(toEntity.name);
            graph.set(fromEntity.name, connections);
          }
        }
      }
    }
  }

  return graph;
}

/**
 * Infer business domain from all schemas
 */
function inferDomain(schemas: SimpleSchema[]): string {
  const allColumns = new Set<string>();
  const keywords = new Map<string, number>();

  for (const schema of schemas) {
    for (const table of schema.tables) {
      for (const column of table.columns) {
        const colName = column.columnName.toLowerCase();
        allColumns.add(colName);

        // Extract keywords
        const words = colName.split('_');
        for (const word of words) {
          if (word.length > 2) {
            keywords.set(word, (keywords.get(word) || 0) + 1);
          }
        }
      }
    }
  }

  // Common business domain keywords
  const domainKeywords = {
    ecommerce: ['order', 'product', 'cart', 'payment', 'customer'],
    hr: ['employee', 'department', 'position', 'salary', 'hr'],
    crm: ['customer', 'contact', 'lead', 'account', 'opportunity'],
    analytics: ['metric', 'kpi', 'dashboard', 'report', 'analytics'],
  };

  let maxScore = 0;
  let inferredDomain = 'general';

  for (const [domain, keywords_list] of Object.entries(domainKeywords)) {
    let score = 0;
    for (const keyword of keywords_list) {
      if (keywords.has(keyword)) {
        score += keywords.get(keyword)!;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      inferredDomain = domain;
    }
  }

  return inferredDomain;
}

/**
 * Load business context from file
 */
export async function loadBusinessContext(
  conversationDir: string,
): Promise<BusinessContext | null> {
  const { readFile } = await import('node:fs/promises');
  const contextPath = join(conversationDir, BUSINESS_CONTEXT_FILE);

  try {
    const content = await readFile(contextPath, 'utf-8');
    const data = JSON.parse(content);

    // Reconstruct Maps from JSON
    return {
      entities: new Map(data.entities || []),
      vocabulary: new Map(data.vocabulary || []),
      relationships: data.relationships || [],
      entityGraph: new Map(data.entityGraph || []),
      domain: data.domain || 'general',
      views: new Map(data.views || []),
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Save business context to file
 */
export async function saveBusinessContext(
  conversationDir: string,
  context: BusinessContext,
): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(conversationDir, { recursive: true });

  const contextPath = join(conversationDir, BUSINESS_CONTEXT_FILE);

  // Convert Maps to arrays for JSON serialization
  const serializable = {
    entities: Array.from(context.entities.entries()),
    vocabulary: Array.from(context.vocabulary.entries()),
    relationships: context.relationships,
    entityGraph: Array.from(context.entityGraph.entries()),
    domain: context.domain,
    views: Array.from(context.views.entries()),
    updatedAt: new Date().toISOString(),
  };

  await writeFile(contextPath, JSON.stringify(serializable, null, 2), 'utf-8');
}

/**
 * Analyze schema and update business context
 */
export async function analyzeSchemaAndUpdateContext(
  conversationDir: string,
  viewName: string,
  schema: SimpleSchema,
): Promise<BusinessContext> {
  // Load existing context or create new one
  let context = await loadBusinessContext(conversationDir);

  if (!context) {
    context = {
      entities: new Map(),
      vocabulary: new Map(),
      relationships: [],
      entityGraph: new Map(),
      domain: 'general',
      views: new Map(),
      updatedAt: new Date().toISOString(),
    };
  }

  // Analyze the new schema
  const newEntities = analyzeSchema(schema);

  // Update entities map
  for (const entity of newEntities) {
    if (entity.columns.length === 0) continue;
    const firstColumn = entity.columns[0];
    if (!firstColumn) continue;
    const key = firstColumn.toLowerCase();
    const existing = context.entities.get(key);

    if (existing) {
      // Merge with existing entity
      existing.columns.push(...entity.columns);
      if (!existing.views.includes(viewName)) {
        existing.views.push(viewName);
      }
    } else {
      context.entities.set(key, entity);
    }
  }

  // Update view metadata
  const viewMetadata: ViewMetadata = {
    viewName,
    schema,
    entities: newEntities.map((e) => e.name),
    lastAnalyzed: new Date().toISOString(),
  };
  context.views.set(viewName, viewMetadata);

  // Rebuild vocabulary with all entities
  context.vocabulary = buildVocabulary(Array.from(context.entities.values()));

  // If we have multiple views, do cross-view analysis
  if (context.views.size >= 2) {
    const allSchemas = Array.from(context.views.entries())
      .map(([name, meta]) => {
        if (!meta) return null;
        return {
          viewName: name,
          schema: meta.schema,
        };
      })
      .filter(
        (s): s is { viewName: string; schema: SimpleSchema } => s !== null,
      );

    // Find relationships
    context.relationships = findCommonColumns(allSchemas);

    // Build entity graph
    context.entityGraph = buildEntityGraph(
      Array.from(context.entities.values()),
      context.relationships,
    );

    // Infer domain from all schemas
    context.domain = inferDomain(allSchemas.map((s) => s.schema));
  }

  // Save updated context
  await saveBusinessContext(conversationDir, context);

  return context;
}
