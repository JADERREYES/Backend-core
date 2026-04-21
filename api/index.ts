import 'reflect-metadata';
import express from 'express';
import { Logger } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { createConfiguredApp } from '../src/bootstrap';

const server = express();
let initializedApp: Promise<void> | null = null;
const logger = new Logger('VercelHandler');

async function ensureApp() {
  if (!initializedApp) {
    initializedApp = (async () => {
      logger.log('Initializing serverless Nest application');
      const app = await createConfiguredApp(new ExpressAdapter(server));
      await app.init();
      logger.log('Serverless Nest application initialized');
    })();
  }

  await initializedApp;
}

export default async function handler(req: any, res: any) {
  try {
    await ensureApp();
    return server(req, res);
  } catch (error) {
    logger.error('Backend-core serverless bootstrap failed', error);
    res.status(500).json({
      message: 'Backend bootstrap failed',
      error: error instanceof Error ? error.message : 'unknown_error',
    });
  }
}
