// Stand-in for `next start` in the supervisor tests. Receives the same argv
// shape (`start ... -H 127.0.0.1 -p <port>`); STUB_SERVER_MODE picks the
// failure to simulate.
import { existsSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const args = process.argv.slice(2);
let port = 0;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-p') port = Number(args[i + 1]);
}

const mode = process.env.STUB_SERVER_MODE ?? 'serve';
const stateFile = process.env.STUB_STATE_FILE;

if (mode === 'crash') {
  process.exit(42);
} else if (mode === 'never-listen') {
  // Alive but never binds, so the warm-up can never succeed.
  setInterval(() => {}, 60_000);
} else {
  // 'serve', or 'exit-after-first-response' on its first run (state file absent):
  // respond once, then die unexpectedly so the supervisor must restart.
  const exitAfterResponse =
    mode === 'exit-after-first-response' && stateFile !== undefined && !existsSync(stateFile);
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('stub ok');
    if (exitAfterResponse) {
      writeFileSync(stateFile, 'ran');
      setTimeout(() => process.exit(7), 200);
    }
  });
  server.listen(port, '127.0.0.1');
}
