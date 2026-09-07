// Import this FIRST: as a module it evaluates before importers that read process.env at load time.
import { config } from 'dotenv';

// dotenv never overrides, so .env.local wins.
config({ path: '.env.local' });
config();
