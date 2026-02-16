import { createServer } from './server/http-server.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = process.env.MOB_DATA_DIR || './data';
const FORGETFUL = process.argv.includes('--forgetful') || process.env.MOB_FORGETFUL === 'true';

async function main() {
  console.log(`🦘 Mob CRM starting...`);
  console.log(`   Mode: ${FORGETFUL ? 'Forgetful (ephemeral)' : 'Persistent'}`);
  console.log(`   Data: ${FORGETFUL ? 'In-memory' : DATA_DIR}`);
  console.log(`   Port: ${PORT}`);

  const server = createServer({ port: PORT, dataDir: DATA_DIR, forgetful: FORGETFUL });
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
