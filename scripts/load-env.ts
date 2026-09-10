// Import this FIRST: as a module it evaluates before importers that read process.env at load time.
import { config } from 'dotenv';

// dotenv never overrides, so .env.local wins. quiet suppresses dotenv's own
// stdout (injection banners and promotional tips) in script output.
config({ path: '.env.local', quiet: true });
config({ quiet: true });
