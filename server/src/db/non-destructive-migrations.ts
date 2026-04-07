export interface NumericColumnMigrationSpec {
  tableName: "trips" | "user";
  columnName: string;
  precision: number;
  scale: number;
}

export const NUMERIC_COLUMN_MIGRATIONS: NumericColumnMigrationSpec[] = [
  { tableName: "trips", columnName: "distance_km", precision: 10, scale: 3 },
  { tableName: "trips", columnName: "co2_saved_kg", precision: 10, scale: 3 },
  { tableName: "trips", columnName: "money_saved_eur", precision: 10, scale: 2 },
  { tableName: "trips", columnName: "fuel_saved_l", precision: 10, scale: 3 },
  { tableName: "trips", columnName: "fuel_price_eur", precision: 10, scale: 3 },
  { tableName: "user", columnName: "consumption_l100", precision: 5, scale: 2 },
];

export function buildAlterNumericColumnSql(spec: NumericColumnMigrationSpec): string {
  return `ALTER TABLE "${spec.tableName}" ALTER COLUMN "${spec.columnName}" TYPE numeric(${spec.precision}, ${spec.scale}) USING ROUND("${spec.columnName}"::numeric, ${spec.scale});`;
}

export function buildAddTimezoneColumnSql(): string {
  return 'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timezone" text;';
}

export function buildNonDestructiveMigrationSql(): string[] {
  return [
    ...NUMERIC_COLUMN_MIGRATIONS.map(buildAlterNumericColumnSql),
    buildAddTimezoneColumnSql(),
  ];
}
