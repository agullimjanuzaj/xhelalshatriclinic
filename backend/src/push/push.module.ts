import { Global, Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';

// Global so PushService can be injected by any other module (patients,
// sessions, payments, treatment-plans) without per-module imports.
@Global()
@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
