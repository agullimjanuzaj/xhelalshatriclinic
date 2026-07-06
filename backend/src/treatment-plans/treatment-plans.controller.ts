import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TreatmentPlansService } from './treatment-plans.service';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import { UpdateTreatmentPlanDto } from './dto/update-treatment-plan.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Planet e Trajtimit')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('treatment-plans')
export class TreatmentPlansController {
  constructor(private readonly service: TreatmentPlansService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Listo planet e trajtimit' })
  findAll(
    @Query() dto: PaginationDto & { patientId?: string; branchId?: string; dateFrom?: string; dateTo?: string },
    @CurrentUser() user: any,
  ) {
    return this.service.findAll(dto, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Shiko një plan trajtimi' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.findOne(id, user);
  }

  @Get(':id/summary')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Përmbledhja e planit' })
  getSummary(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.getSummary(id, user);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Krijo kontrollë (plan trajtimi)' })
  create(@Body() dto: CreateTreatmentPlanDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Post('generate-notes')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Gjenero draft "Plani i tretmanit" nga diagnoza, ankesat dhe llojet e trajtimit' })
  generateNotes(@Body() dto: { diagnosis?: string; treatmentTypes?: string[]; totalSessions?: number; existingNotes?: string; complaints?: string[]; selectedDiagnoses?: string[] }) {
    return this.service.generateNotes(dto.diagnosis, dto.treatmentTypes, dto.totalSessions, dto.existingNotes, dto.complaints, dto.selectedDiagnoses);
  }

  @Post('generate-complaint-description')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Gjenero përshkrimin e ankesave nga lista e ankesave të zgjedhura' })
  generateComplaintDescription(@Body() dto: { complaints: string[] }) {
    return this.service.generateComplaintDescription(dto.complaints);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Edito kontrollën (planin e trajtimit)' })
  update(@Param('id') id: string, @Body() dto: UpdateTreatmentPlanDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Fshi planin e trajtimit' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }
}
