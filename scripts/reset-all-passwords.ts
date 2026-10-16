// Pone la misma contraseña a TODOS los usuarios de la base de datos de DATABASE_URL.
// Uso: npx tsx scripts/reset-all-passwords.ts <contraseña>
import "dotenv/config";
import bcrypt from "bcryptjs";
import { Client } from "pg";

async function main() {
  const password = process.argv[2];
  if (!password || password.length < 8) {
    throw new Error("Pasa una contraseña de al menos 8 caracteres.");
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await client.query<{ email: string }>(
      `update users set "passwordHash" = $1, "updatedAt" = now() returning email`,
      [passwordHash],
    );
    console.log(`✔ Contraseña cambiada a ${rows.length} usuarios:`);
    for (const r of rows) console.log(`  - ${r.email}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
