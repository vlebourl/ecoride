import postgres from "postgres";
import { buildNonDestructiveMigrationSql } from "../src/db/non-destructive-migrations";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const sql = postgres(databaseUrl);

  try {
    await sql.begin(async (tx) => {
      for (const statement of buildNonDestructiveMigrationSql()) {
        console.log(`Applying: ${statement}`);
        await tx.unsafe(statement);
      }
    });

    console.log("Non-destructive schema migration applied successfully.");
  } finally {
    await sql.end();
  }
}

await main();
