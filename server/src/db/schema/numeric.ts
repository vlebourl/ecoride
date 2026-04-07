import { customType } from "drizzle-orm/pg-core";

function buildNumericSql(precision?: number, scale?: number): string {
  if (precision == null) return "numeric";
  if (scale == null) return `numeric(${precision})`;
  return `numeric(${precision}, ${scale})`;
}

function parsePgNumeric(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid PostgreSQL numeric value: ${value}`);
  }
  return parsed;
}

export const numericNumber = customType<{
  data: number;
  driverData: string;
  config: { precision?: number; scale?: number };
}>({
  dataType(config) {
    return buildNumericSql(config?.precision, config?.scale);
  },
  toDriver(value) {
    return String(value);
  },
  fromDriver(value) {
    return parsePgNumeric(value);
  },
});

export { parsePgNumeric };
