declare module 'pg' {
  export type ClientConfig = string | Record<string, unknown>;

  export type FieldDef = {
    name: string;
    dataTypeID: number;
  };

  export interface QueryResult<T = unknown> {
    rows: T[];
    rowCount: number | null;
    fields: FieldDef[];
  }

  export class Client {
    constructor(config?: ClientConfig);
    connect(): Promise<void>;
    end(): Promise<void>;
    query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  }
}

