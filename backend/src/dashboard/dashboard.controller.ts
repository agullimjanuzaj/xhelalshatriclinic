import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Paneli')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('admin')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Statistikat e Admin-it' })
  getAdminStats(@Query('branchId') branchId?: string) {
    return this.dashboardService.getAdminStats(branchId);
  }

  @Get('manager')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Statistikat e Menaxherit' })
  getManagerStats(@CurrentUser() user: any, @Query('branchId') branchId?: string) {
    if (user.role === Role.MANAGER) {
      const userBranchIds: string[] = user.userBranches?.map((ub: any) => ub.branchId) || [];
      branchId = branchId && userBranchIds.includes(branchId) ? branchId : userBranchIds[0];
    }
    return this.dashboardService.getManagerStats(user.id, branchId);
  }

  @Get('physiotherapist')
  @Roles(Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Statistikat e Fizioterapeutit' })
  getPhysiotherapistStats(@CurrentUser('id') userId: string) {
    return this.dashboardService.getPhysiotherapistStats(userId);
  }

  @Get('revenue-chart')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Grafiku i të ardhurave' })
  getRevenueChart(@CurrentUser() user: any, @Query('branchId') branchId?: string, @Query('year') year?: number) {
    if (user.role === Role.MANAGER) {
      const userBranchIds: string[] = user.userBranches?.map((ub: any) => ub.branchId) || [];
      branchId = branchId && userBranchIds.includes(branchId) ? branchId : userBranchIds[0];
    }
    return this.dashboardService.getRevenueChart(branchId, year);
  }
}
