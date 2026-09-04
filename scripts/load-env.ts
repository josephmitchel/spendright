// Loads env for scripts. Import it FIRST: imports are hoisted above inline
// statements, so a bare config() call would run after modules that read
// process.env at load time. As a module it evaluates in import order.
import { config } from 'dotenv';

// .env.local first, then .env; dotenv never overrides, so .env.local wins.
config({ path: '.env.local' });
config();
