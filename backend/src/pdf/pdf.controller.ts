import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PdfService } from './pdf.service';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('PDF')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  @Get('invoice/:paymentId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Gjenero faturën PDF' })
  generateInvoice(@Param('paymentId') paymentId: string, @Res() res: Response, @CurrentUser() user: any) {
    return this.pdfService.generateInvoicePdf(paymentId, res, user);
  }

  @Get('invoice/:paymentId/html')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Gjenero faturën në HTML (për print)' })
  async generateInvoiceHtml(@Param('paymentId') paymentId: string, @Res() res: Response, @CurrentUser() user: any) {
    const html = await this.pdfService.generateInvoiceHtml(paymentId, user);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('session/:sessionId')
  @ApiOperation({ summary: 'Gjenero raportin e seancës PDF' })
  generateSessionReport(@Param('sessionId') sessionId: string, @Res() res: Response) {
    return this.pdfService.generateSessionReportPdf(sessionId, res);
  }

  @Get('session/:sessionId/html')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Gjenero raportin e seancës në HTML (për print/WhatsApp)' })
  async generateSessionReportHtml(@Param('sessionId') sessionId: string, @Res() res: Response, @CurrentUser() user: any) {
    const html = await this.pdfService.generateSessionReportHtml(sessionId, user);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('treatment-plan/:planId/html')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Gjenero raportin e planit të trajtimit në HTML (për print/WhatsApp)' })
  async generateTreatmentPlanHtml(@Param('planId') planId: string, @Res() res: Response, @CurrentUser() user: any) {
    const html = await this.pdfService.generateTreatmentPlanHtml(planId, user);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}
