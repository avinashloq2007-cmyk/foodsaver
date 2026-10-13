// These overrides apply only to this child process, never to the production .env.
process.env.NODE_ENV='development';process.env.DEMO_MODE='true';process.env.DB_DRIVER='sqlite';process.env.SEED_DEMO='true';process.env.HOST='127.0.0.1';process.env.APP_ORIGIN=`http://localhost:${process.env.PORT||3000}`;
await import('../server/index.js');
