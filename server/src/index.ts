import app from './app';
import dotenv from 'dotenv';
import { runRenderEmailHealthcheck, TEMPLATE_KEYS } from './services/render-email.service';

dotenv.config();

const PORT = process.env.PORT || 3000;

// D-ext7 fail-fast: refuse to bind a port if any transactional email
// template would fail at runtime. The healthcheck runs migration-006 seeds +
// shell template against `compileMjml` and surfaces every failure in one
// structured error. Devs must run `npm --workspace server run migrate` (or
// equivalent) before starting the server, otherwise the brand singleton row
// will be missing and bootServer will exit with code 1.
async function bootServer(): Promise<void> {
  await runRenderEmailHealthcheck();
  console.log(`[renderEmail] healthcheck ok (${TEMPLATE_KEYS.size}/${TEMPLATE_KEYS.size} templates)`);
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

bootServer().catch((err) => {
  console.error('[boot] fatal — server will not start', err);
  process.exit(1);
});
