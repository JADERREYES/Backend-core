import 'reflect-metadata';
import express from 'express';
import { ExpressAdapter } from '@nestjs/platform-express';
import { createConfiguredApp } from '../src/bootstrap';

const server = express();
let initializedApp: Promise<void> | null = null;

async function ensureApp() {
  if (!initializedApp) {
    initializedApp = (async () => {
      const app = await createConfiguredApp(new ExpressAdapter(server));
      await app.init();
    })();
  }

  await initializedApp;
}

export default async function handler(req: any, res: any) {
  await ensureApp();
  return server(req, res);
}
