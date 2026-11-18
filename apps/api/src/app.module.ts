import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerParams } from './common/logging/logger.config';

@Module({
  // NODE_ENV is read directly until ConfigModule is wired into AppModule (T037).
  imports: [LoggerModule.forRoot(buildLoggerParams(process.env.NODE_ENV))],
})
export class AppModule {}
