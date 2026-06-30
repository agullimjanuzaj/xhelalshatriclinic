import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ComplaintsService } from './complaints.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { SetSuggestedConditionsDto } from './dto/set-suggested-conditions.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Ankesat Kryesore')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Listo ankesat kryesore (me gjendjet e sugjeruara të lidhura)' })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.complaintsService.findAll(activeOnly === 'true');
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Shto ankesë të re' })
  create(@Body() dto: CreateComplaintDto) {
    return this.complaintsService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ndrysho ankesën' })
  update(@Param('id') id: string, @Body() dto: UpdateComplaintDto) {
    return this.complaintsService.update(id, dto);
  }

  @Patch(':id/suggested-conditions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Vendos lidhjen Ankesë → Gjendje të sugjeruara (zëvendëson lidhjet ekzistuese)' })
  setSuggestedConditions(@Param('id') id: string, @Body() dto: SetSuggestedConditionsDto) {
    return this.complaintsService.setSuggestedConditions(id, dto.suggestedConditionIds);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Fshi ankesën' })
  remove(@Param('id') id: string) {
    return this.complaintsService.remove(id);
  }
}
