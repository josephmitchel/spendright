// Loads .env.local for the scripts in this directory. Import it FIRST, above
// every other import, in any script that needs env.
//
// Its whole reason for existing is import order. A bare
// `config({ path: '.env.local' })` written between a script's imports does NOT
// run before them: both ESM and the CJS transform tsx uses hoist every import
// above any statement sitting between them (verified with tsx 4.23.13 — a
// module imported above such a statement and one imported below it both saw
// the env var as undefined). So the imports all evaluate first, and anything
// that reads process.env at module load time captures undefined without
// complaint — @/lib/db is the live example, building
// `new Pool({ connectionString: process.env.DATABASE_URL })` at module scope.
//
// A module is what actually fixes that, because module evaluation does follow
// import order: imported first, this file runs before the imports written
// below it, and env is loaded by the time they are evaluated.
import { config } from 'dotenv';

config({ path: '.env.local' });
// Then .env as a fallback, matching drizzle.config.ts and Next.js itself.
// dotenv never overrides an already-set variable, so .env.local still wins.
// Without this a DATABASE_URL kept in .env would let db:migrate run (its
// config reads both) while seed:cards failed complaining about .env.local —
// two commands in the same workflow disagreeing about where env comes from.
config();
