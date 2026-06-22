import { createServer } from './server/http-server.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = process.env.MOB_DATA_DIR || './data';
const FORGETFUL = process.argv.includes('--forgetful') || process.env.MOB_FORGETFUL === 'true';
const BASE_URL = process.env.MOB_BASE_URL || `http://localhost:${PORT}`;
const HOSTED = process.env.MOB_HOSTED === 'true';

async function main() {
  console.log(`🦘 Mob CRM starting...`);
  console.log(`   Mode: ${FORGETFUL ? 'Forgetful (ephemeral)' : 'Persistent'}`);
  console.log(`   Data: ${FORGETFUL ? 'In-memory' : DATA_DIR}`);
  console.log(`   Port: ${PORT}`);
  console.log(`   URL: ${BASE_URL}`);
  console.log(`   Hosting: ${HOSTED ? 'Hosted (plan limits active)' : 'Self-hosted (unlimited)'}`);

  const server = createServer({ port: PORT, dataDir: DATA_DIR, forgetful: FORGETFUL, baseUrl: BASE_URL, hosted: HOSTED });
  server.start();

  const shutdown = () => {
    console.log('\n🦘 Mob CRM shutting down...');
    server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start Mob CRM:', err);
  process.exit(1);
});
