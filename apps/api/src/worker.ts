import './load-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // SIGTERM/SIGINT → close BullMQ workers and Redis connections cleanly.
  app.enableShutdownHooks();
}

bootstrap().catch((err: unknown) => {
  console.error('Worker failed to start', err);
  process.exit(1);
});
