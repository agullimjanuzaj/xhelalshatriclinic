import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PaymentStatus, Role } from '@prisma/client';

@ApiTags('Pagesat')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Listo pagesat' })
  findAll(
    @Query() dto: PaginationDto & { branchId?: string; patientId?: string; status?: PaymentStatus; dateFrom?: string; dateTo?: string },
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.findAll(dto, user);
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Statistikat e pagesave' })
  getStats(@Query('branchId') branchId?: string, @CurrentUser() user?: any) {
    return this.paymentsService.getStats(branchId, user);
  }

  @Get('debts')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Borxhet aktuale sipas pacientit/trajtimit (me pagination)' })
  getDebts(
    @Query('branchId') branchId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: any,
  ) {
    return this.paymentsService.getDebts(branchId, Number(page) || 1, Number(limit) || 24, user);
  }

  @Get('treatment-plan/:planId/financials')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Përmbledhja financiare e një plani trajtimi' })
  getPlanFinancials(@Param('planId') planId: string, @CurrentUser() user: any) {
    return this.paymentsService.getPlanFinancials(planId, user);
  }

  @Get('patient/:patientId/unpaid-plans')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Planet e papaguara të pacientit (për formularin e pagesës)' })
  getUnpaidPlans(@Param('patientId') patientId: string, @CurrentUser() user: any) {
    return this.paymentsService.getUnpaidPlans(patientId, user);
  }

  @Get('plan/:planId/sessions')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Seancat e një kontrollë me gjendjen e pagesës (për formularin e pagesës)' })
  getPlanSessions(@Param('planId') planId: string, @CurrentUser() user: any) {
    return this.paymentsService.getPlanSessions(planId, user);
  }

  @Get('session/:sessionId/info')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Gjendja financiare e një seance standalone (paidAmount, remainingAmount)' })
  getSessionInfo(@Param('sessionId') sessionId: string, @CurrentUser() user: any) {
    return this.paymentsService.getSessionInfo(sessionId, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Shiko një pagesë' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.paymentsService.findOne(id, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Regjistro pagesë të re' })
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: any) {
    return this.paymentsService.create(dto, user);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Edito pagesën' })
  update(@Param('id') id: string, @Body() dto: Partial<CreatePaymentDto>, @CurrentUser() user: any) {
    return this.paymentsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Fshi/anulo pagesën' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.paymentsService.remove(id, user);
  }
}
