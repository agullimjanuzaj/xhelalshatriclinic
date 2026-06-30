import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { CompleteSessionDto } from './dto/complete-session.dto';
import { UpdateSessionPriceDto } from './dto/update-session-price.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SessionStatus, Role } from '@prisma/client';

@ApiTags('Seancat')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Listo seancat' })
  findAll(
    @Query() dto: PaginationDto & { branchId?: string; patientId?: string; treatmentPlanId?: string; physiotherapistId?: string; status?: SessionStatus; isPaid?: string; dateFrom?: string; dateTo?: string },
    @CurrentUser() user: any,
  ) {
    return this.sessionsService.findAll(dto, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Shiko një seancë' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.sessionsService.findOne(id, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Krijo seancë të re' })
  create(@Body() dto: CreateSessionDto, @CurrentUser() user: any) {
    return this.sessionsService.create(dto, user);
  }

  @Post('generate-recommendation')
  @Roles(Role.ADMIN, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Gjenero draft rekomandimi nga shënimi i shkurtër' })
  generateRecommendation(@Body() dto: { notes?: string; treatmentTypes?: string[] }) {
    return this.sessionsService.generateRecommendation(dto.notes, dto.treatmentTypes);
  }

  @Patch(':id/complete')
  @Roles(Role.ADMIN, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Kompletohet seanca' })
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteSessionDto,
    @CurrentUser() user: any,
  ) {
    return this.sessionsService.complete(id, dto, user);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Edito seancën' })
  update(@Param('id') id: string, @Body() dto: UpdateSessionDto, @CurrentUser() user: any) {
    return this.sessionsService.update(id, dto, user);
  }

  @Patch(':id/price')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ndrysho çmimin e një seance specifike (vetëm ADMIN)' })
  updatePrice(@Param('id') id: string, @Body() dto: UpdateSessionPriceDto, @CurrentUser() user: any) {
    return this.sessionsService.updatePrice(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Fshi seancën' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.sessionsService.remove(id, user);
  }
}
