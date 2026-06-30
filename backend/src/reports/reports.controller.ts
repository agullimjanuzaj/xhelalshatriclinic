import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Raportet')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Përmbledhje raporti me filtra (muaj, datë, user, degë, pacient)' })
  getOverview(
    @Query('month') month?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('userId') userId?: string,
    @Query('branchId') branchId?: string,
    @Query('patientId') patientId?: string,
    @CurrentUser() user?: any,
  ) {
    return this.reportsService.getOverview({ month, dateFrom, dateTo, userId, branchId, patientId }, user);
  }

  @Get('sessions')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Raporti i seancave/trajtimeve (filtra: muaj, datë, fizioterapeut/user, degë)' })
  getSessionsReport(
    @Query('branchId') branchId?: string,
    @Query('physiotherapistId') physiotherapistId?: string,
    @Query('userId') userId?: string,
    @Query('month') month?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('groupBy') groupBy?: 'branch' | 'physiotherapist' | 'day' | 'month',
    @CurrentUser() user?: any,
  ) {
    // `userId` is accepted as an alias of `physiotherapistId` so every
    // Reports tab can be driven by the exact same filter object shape.
    return this.reportsService.getSessionsReport(
      { branchId, physiotherapistId: physiotherapistId || userId, month, dateFrom, dateTo, groupBy },
      user,
    );
  }

  @Get('revenue')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Raporti i të ardhurave (mujore, sipas degës, datës, ose përdoruesit)' })
  getRevenueReport(
    @Query('branchId') branchId?: string,
    @Query('userId') userId?: string,
    @Query('month') month?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('groupBy') groupBy?: 'month' | 'branch' | 'day' | 'user',
    @CurrentUser() user?: any,
  ) {
    return this.reportsService.getRevenueReport({ branchId, userId, month, dateFrom, dateTo, groupBy }, user);
  }

  @Get('outstanding-balances')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Balancet e pa paguara (filtra: muaj, datë, user, degë)' })
  getOutstandingBalances(
    @Query('branchId') branchId?: string,
    @Query('patientId') patientId?: string,
    @Query('userId') userId?: string,
    @Query('month') month?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: any,
  ) {
    return this.reportsService.getOutstandingBalances(
      { branchId, patientId, userId, month, dateFrom, dateTo, paymentStatus, page: Number(page) || 1, limit: Number(limit) || 24 },
      user,
    );
  }

  @Get('bonuses')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Raporti i bonusit për trajtime/seanca të kompletuara (filtra: muaj, datë, user, degë)' })
  getBonusReport(
    @Query('month') month?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('userId') userId?: string,
    @Query('branchId') branchId?: string,
    @CurrentUser() user?: any,
  ) {
    return this.reportsService.getBonusReport({ month, dateFrom, dateTo, userId, branchId }, user);
  }

  @Get('patient-activity')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Aktiviteti i pacientëve' })
  getPatientActivityReport(@Query('branchId') branchId?: string, @CurrentUser() user?: any) {
    return this.reportsService.getPatientActivityReport(branchId, user);
  }
}
