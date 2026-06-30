import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TreatmentsService } from './treatments.service';
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { UpdateTreatmentDto } from './dto/update-treatment.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SymptomType, Role } from '@prisma/client';

@ApiTags('Trajtimet')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('treatments')
export class TreatmentsController {
  constructor(private readonly treatmentsService: TreatmentsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Listo trajtimet' })
  findAll(
    @Query() dto: PaginationDto & { patientId?: string; physiotherapistId?: string },
    @CurrentUser() user: any,
  ) {
    return this.treatmentsService.findAll(dto, user);
  }

  @Get('suggestions')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Sugjerime bazuar në simptoma' })
  getSuggestions(@Query('symptoms') symptoms: string) {
    const symptomList = (symptoms?.split(',') as SymptomType[]) || [];
    return this.treatmentsService.getSuggestions(symptomList);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Shiko një trajtim' })
  findOne(@Param('id') id: string) {
    return this.treatmentsService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Krijo trajtim të ri' })
  create(@Body() dto: CreateTreatmentDto, @CurrentUser() user: any) {
    return this.treatmentsService.create(dto, user);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Edito trajtimin' })
  update(@Param('id') id: string, @Body() dto: UpdateTreatmentDto, @CurrentUser() user: any) {
    return this.treatmentsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Fshi trajtimin' })
  remove(@Param('id') id: string) {
    return this.treatmentsService.remove(id);
  }
}
