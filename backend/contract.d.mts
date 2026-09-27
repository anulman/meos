export const schemas: Record<string, unknown>
export const resourceSchemas: Record<string, string>
export const operations: Record<string, { description: string; input: unknown; output: unknown; scope: string; write: boolean; mutates?: boolean }>
export function validateSchema(schema: unknown, value: unknown, path?: string): void
export function inlineSchema(schema: unknown): unknown
