import 'dotenv/config';
import { randomBytes } from 'node:crypto';
export const config = {
  production: process.env.NODE_ENV === 'production',
  demo: process.env.DEMO_MODE === 'true',
  driver: process.env.DB_DRIVER || 'mysql',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  origin: process.env.APP_ORIGIN || 'http://localhost:3000',
  secret: process.env.AUTH_SECRET || randomBytes(32).toString('hex'),
  sqlitePath: process.env.SQLITE_PATH || 'data/demo.sqlite',
  firebase: {apiKey: process.env.FIREBASE_API_KEY, authDomain: process.env.FIREBASE_AUTH_DOMAIN, projectId: process.env.FIREBASE_PROJECT_ID, appId: process.env.FIREBASE_APP_ID}
};
if (config.production && (config.demo || config.driver !== 'mysql')) throw new Error('Production requires MySQL and DEMO_MODE=false.');
if (config.production && (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)) throw new Error('Set a strong AUTH_SECRET (32+ characters).');
if (config.demo && config.host !== '127.0.0.1') throw new Error('Demo is restricted to loopback.');
