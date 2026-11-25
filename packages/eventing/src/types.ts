export interface Queryable {
  query<T = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface Logger {
  debug?(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, meta?: Record<string, unknown>): void;
}

export const consoleLogger: Logger = {
  debug: (m, meta) => console.debug(m, meta),
  info: (m, meta) => console.info(m, meta),
  warn: (m, meta) => console.warn(m, meta),
  error: (m, meta) => console.error(m, meta),
};

export const noopLogger: Logger = {};
