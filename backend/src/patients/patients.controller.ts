import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Pacientët')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Listo të gjithë pacientët' })
  findAll(
    @Query() dto: PaginationDto & { branchId?: string; gender?: string; activeInClinic?: string; status?: string },
    @CurrentUser() user: any,
  ) {
    return this.patientsService.findAll(dto, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Shiko një pacient' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.patientsService.findOne(id, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Regjistro pacient të ri' })
  create(@Body() dto: CreatePatientDto, @CurrentUser() user: any) {
    return this.patientsService.create(dto, user);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Edito pacientin' })
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto, @CurrentUser() user: any) {
    return this.patientsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Fshi pacientin' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.patientsService.remove(id, user);
  }

  @Patch(':id/active-in-clinic')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Shëno pacientin aktiv/joaktiv në klinikë (tick i recepsionit)' })
  setActiveInClinic(
    @Param('id') id: string,
    @Body('activeInClinic') activeInClinic: boolean,
    @CurrentUser() user: any,
  ) {
    return this.patientsService.setActiveInClinic(id, !!activeInClinic, user);
  }
}
