import { Module } from '@nestjs/common';
import { TreatmentTypesController } from './treatment-types.controller';
import { TreatmentTypesService } from './treatment-types.service';

@Module({
  controllers: [TreatmentTypesController],
  providers: [TreatmentTypesService],
  exports: [TreatmentTypesService],
})
export class TreatmentTypesModule {}
