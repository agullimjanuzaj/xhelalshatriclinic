import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TreatmentTypesService } from './treatment-types.service';
import { CreateTreatmentTypeDto } from './dto/create-treatment-type.dto';
import { UpdateTreatmentTypeDto } from './dto/update-treatment-type.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Llojet e Trajtimeve')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('treatment-types')
export class TreatmentTypesController {
  constructor(private readonly treatmentTypesService: TreatmentTypesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Listo llojet e trajtimeve' })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.treatmentTypesService.findAll(activeOnly === 'true');
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Shto lloj trajtimi të ri' })
  create(@Body() dto: CreateTreatmentTypeDto) {
    return this.treatmentTypesService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ndrysho llojin e trajtimit' })
  update(@Param('id') id: string, @Body() dto: UpdateTreatmentTypeDto) {
    return this.treatmentTypesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Fshi llojin e trajtimit' })
  remove(@Param('id') id: string) {
    return this.treatmentTypesService.remove(id);
  }
}
