import { Module } from '@nestjs/common';
import { SuggestedConditionsController } from './suggested-conditions.controller';
import { SuggestedConditionsService } from './suggested-conditions.service';

@Module({
  controllers: [SuggestedConditionsController],
  providers: [SuggestedConditionsService],
  exports: [SuggestedConditionsService],
})
export class SuggestedConditionsModule {}
