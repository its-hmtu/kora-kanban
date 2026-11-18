import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerParams } from './common/logging/logger.config';
import { ConfigModule } from './infra/config/config.module';

@Module({
  // NODE_ENV is read directly until ConfigModule is wired into AppModule (T037).
  imports: [ConfigModule, LoggerModule.forRoot(buildLoggerParams(process.env.NODE_ENV))],
})
export class AppModule {}
