import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computePlanFinancials } from '../payments/plan-financials.util';
import { Role } from '@prisma/client';
import * as PDFDocument from 'pdfkit';
import { Response } from 'express';
import * as dayjs from 'dayjs';
import * as fs from 'fs';
import * as path from 'path';

const STATUS_LABELS: Record<string, string> = {
  PAID: 'Paguar',
  PARTIALLY_PAID: 'Pjesërisht paguar',
  UNPAID: 'Pa paguar',
};

// In-app, the clinic is always "Xhelal Shatri Clinic" — but a printed/shared
// document uses the branch's own public trade name instead, keyed by branch
// city. Any branch without a mapped city falls back to the app name.
const APP_NAME = 'Xhelal Shatri Clinic';
const BRANCH_PRINT_NAMES: Record<string, string> = {
  Istog: 'Fiziomed',
  Pejë: 'Biohit',
  Prishtinë: 'Kiromed',
};
function getBranchPrintName(branch: { city?: string | null } | null | undefined): string {
  const city = branch?.city;
  return (city && BRANCH_PRINT_NAMES[city]) || APP_NAME;
}

const LOGO_PATH = path.join(__dirname, 'assets', 'logo.png');
let cachedLogoDataUri: string | null = null;
// Real app logo, never a placeholder — embedded as a data URI so the HTML
// print/share view never depends on a network round-trip to the frontend.
function getLogoDataUri(): string {
  if (cachedLogoDataUri !== null) return cachedLogoDataUri;
  try {
    cachedLogoDataUri = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`;
  } catch {
    cachedLogoDataUri = '';
  }
  return cachedLogoDataUri;
}

const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// Shared header CSS for every print/share HTML document — a true 3-column
// layout (left/center/right of equal width) is what actually centers the
// logo regardless of how long the clinic name or title text is, unlike a
// 2-column flex header where a long title would visually push the logo
// off-center.
const HEADER_CSS = `
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0f766e; padding-bottom: 16px; margin-bottom: 20px; }
  .header-col { flex: 1; }
  .header-left { text-align: left; }
  .header-center { text-align: center; }
  .header-right { text-align: right; }
  .clinic-name { font-size: 18px; font-weight: 700; color: #0f766e; }
  .header-logo { width: 72px; height: 72px; object-fit: contain; display: inline-block; }
  .doc-title { font-size: 16px; font-weight: 700; }
  .doc-meta { font-size: 11px; color: #64748b; margin-top: 4px; }
`;

// Left: branch-based clinic name (alone, never beside the logo). Center:
// logo, alone in its own column so it's genuinely centered. Right: document
// title + date, with anything else (status badge, etc.) appended after.
function buildHeaderHtml(clinicName: string, title: string, dateLabel: string, logo: string, extraRight = ''): string {
  return `
  <div class="header">
    <div class="header-col header-left">
      <div class="clinic-name">${esc(clinicName)}</div>
    </div>
    <div class="header-col header-center">
      ${logo ? `<img class="header-logo" src="${logo}" alt="Logo" />` : ''}
    </div>
    <div class="header-col header-right">
      <div class="doc-title">${esc(title)}</div>
      <div class="doc-meta">${esc(dateLabel)}</div>
      ${extraRight}
    </div>
  </div>`;
}

@Injectable()
export class PdfService {
  constructor(private readonly prisma: PrismaService) {}

  private async getInvoiceData(paymentId: string, user: any) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, deletedAt: null },
      include: {
        patient: { include: { branch: true } },
        branch: true,
        treatmentPlan: {
          include: {
            assignedPhysiotherapist: { select: { firstName: true, lastName: true } },
            createdByUser: { select: { firstName: true, lastName: true, role: true } },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Pagesa nuk u gjet');

    // Finance documents are never publicly reachable by guessing an id —
    // a physiotherapist has no finance access at all, and a manager is
    // confined to their own branch's invoices, same as everywhere else.
    if (user.role === Role.PHYSIOTHERAPIST) {
      throw new ForbiddenException('Fizioterapeuti nuk ka qasje në faturat');
    }
    if (user.role === Role.MANAGER) {
      const branchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (!branchIds.includes(payment.branchId)) {
        throw new ForbiddenException('Nuk keni qasje në faturën e një dege tjetër');
      }
    }

    const financials = payment.treatmentPlan ? computePlanFinancials(payment.treatmentPlan) : null;
    return { payment, financials };
  }

  async generateInvoicePdf(paymentId: string, res: Response, user: any) {
    const { payment, financials } = await this.getInvoiceData(paymentId, user);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=fatura-${payment.invoiceNumber}.pdf`);
    doc.pipe(res);

    this.drawInvoice(doc, payment, financials);
    doc.end();
  }

  async generateInvoiceHtml(paymentId: string, user: any): Promise<string> {
    const { payment, financials } = await this.getInvoiceData(paymentId, user);
    return this.renderInvoiceHtml(payment, financials);
  }

  private async getSessionReportData(sessionId: string, user: any) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, deletedAt: null },
      include: {
        patient: { include: { branch: true } },
        branch: true,
        physiotherapist: { select: { id: true, firstName: true, lastName: true } },
        completedByUser: { select: { id: true, firstName: true, lastName: true } },
        treatmentPlan: {
          include: {
            sessions: { where: { deletedAt: null }, orderBy: { sessionNumber: 'asc' } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Seanca nuk u gjet');

    if (user.role === Role.MANAGER) {
      const branchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (!branchIds.includes(session.branchId)) throw new ForbiddenException('Nuk keni qasje në këtë seancë');
    } else if (user.role === Role.PHYSIOTHERAPIST) {
      if (session.physiotherapistId !== user.id && session.completedByUserId !== user.id) {
        throw new ForbiddenException('Nuk keni qasje në këtë seancë');
      }
    }

    return session;
  }

  async generateSessionReportHtml(sessionId: string, user: any): Promise<string> {
    const session = await this.getSessionReportData(sessionId, user);
    return this.renderSessionReportHtml(session);
  }

  private renderSessionReportHtml(session: any): string {
    const person = session.physiotherapist || session.completedByUser;
    const plan = session.treatmentPlan;
    const clinicName = getBranchPrintName(session.branch);
    const logo = getLogoDataUri();

    const planSection = plan
      ? `
        <div class="section">
          <div class="section-title">Plani i trajtimit</div>
          <div class="info-grid">
            <div><span class="label">Diagnoza:</span> ${esc(plan.diagnosis || '—')}</div>
            <div><span class="label">Llojet e trajtimit:</span> ${esc((plan.treatmentTypes || []).join(', ') || '—')}</div>
          </div>
        </div>
        <div class="section">
          <div class="section-title">Seancat e kryera</div>
          <table>
            <thead><tr><th>Nr.</th><th>Data</th><th>Statusi</th></tr></thead>
            <tbody>
              ${plan.sessions.map((s: any) => `
                <tr class="${s.id === session.id ? 'highlight' : ''}">
                  <td>${s.sessionNumber ?? '—'}</td>
                  <td>${dayjs(s.completedAt || s.scheduledAt || s.createdAt).format('DD/MM/YYYY')}</td>
                  <td>${s.status === 'COMPLETED' ? 'E kompletuar' : esc(s.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : '';

    // Progress lives at the very bottom, below Rekomandime — same placement
    // as the Kontrollë print — never in the header.
    const progressSection = plan
      ? `<div class="section"><div class="section-title">Progresi</div><div class="info-grid"><div>${plan.completedSessions}/${plan.totalSessions} seanca</div></div></div>`
      : '';

    return `<!DOCTYPE html>
<html lang="sq">
<head>
<meta charset="UTF-8" />
<title>Raport Trajtimi</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; }
  ${HEADER_CSS}
  .section { margin-bottom: 18px; }
  .section-title { font-size: 13px; font-weight: 700; color: #0f766e; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; font-size: 12px; }
  .info-grid div span.label { color: #64748b; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table th { text-align: left; background: #f1f5f9; color: #475569; padding: 6px 8px; font-size: 10px; text-transform: uppercase; }
  table td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
  tr.highlight td { background: #ccfbf1; font-weight: 700; }
  .notes { font-size: 12px; color: #374151; background: #f8fafc; padding: 10px; border-radius: 6px; margin-top: 8px; }
  .footer { margin-top: 36px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  ${buildHeaderHtml(clinicName, 'RAPORT TRAJTIMI', dayjs(session.completedAt || session.scheduledAt || session.createdAt).format('DD/MM/YYYY HH:mm'), logo)}

  <div class="section">
    <div class="section-title">Pacienti</div>
    <div class="info-grid">
      <div><span class="label">Emri:</span> ${esc(session.patient.firstName)} ${esc(session.patient.lastName)}</div>
      <div><span class="label">Telefoni:</span> ${esc(session.patient.phone)}</div>
      <div><span class="label">Dega:</span> ${esc(session.branch?.name)}</div>
      <div><span class="label">Fizioterapeuti:</span> ${person ? `${esc(person.firstName)} ${esc(person.lastName)}` : 'Nuk është caktuar'}</div>
      <div><span class="label">Llojet e trajtimit:</span> ${esc((session.treatmentTypes || []).join(', ') || '—')}</div>
    </div>
  </div>

  ${planSection}

  ${session.notes ? `<div class="section"><div class="section-title">Përshkrimi</div><div class="notes">${esc(session.notes)}</div></div>` : ''}
  ${session.recommendations ? `<div class="section"><div class="section-title">Rekomandime</div><div class="notes">${esc(session.recommendations)}</div></div>` : ''}

  ${progressSection}

  <div class="footer">
    Faleminderit që zgjodhët ${esc(clinicName)}!<br />
    Gjeneruar: ${dayjs().format('DD/MM/YYYY HH:mm')}
  </div>
</body>
</html>`;
  }

  private async getTreatmentPlanReportData(planId: string, user: any) {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id: planId, deletedAt: null },
      include: {
        patient: { include: { branch: true } },
        branch: true,
        assignedPhysiotherapist: { select: { id: true, firstName: true, lastName: true } },
        sessions: { where: { deletedAt: null }, orderBy: { sessionNumber: 'asc' } },
        payments: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!plan) throw new NotFoundException('Plani i trajtimit nuk u gjet');

    if (user.role === Role.MANAGER) {
      const branchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      if (!branchIds.includes(plan.patient.branchId)) throw new ForbiddenException('Nuk keni qasje në këtë plan trajtimi');
    } else if (user.role === Role.PHYSIOTHERAPIST) {
      const branchIds = user.userBranches?.map((ub: any) => ub.branchId) || [];
      const isInvolved =
        plan.assignedPhysiotherapistId === user.id ||
        plan.sessions.some((s: any) => s.physiotherapistId === user.id) ||
        branchIds.includes(plan.patient.branchId);
      if (!isInvolved) throw new ForbiddenException('Nuk keni qasje në këtë plan trajtimi');
    }

    return { plan, financials: computePlanFinancials(plan) };
  }

  async generateTreatmentPlanHtml(planId: string, user: any): Promise<string> {
    const { plan } = await this.getTreatmentPlanReportData(planId, user);
    return this.renderTreatmentPlanHtml(plan);
  }

  // "Plani i Trajtimit" print/share — no payment/financial information ever
  // appears here (Kontrolla print is purely clinical), and the section order
  // is fixed: 1) të dhënat e klientit, 2) ankesat kryesore, 3) plani i
  // trajtimit, 4) shënime nëse ka, 5) progresi, at the very end.
  private renderTreatmentPlanHtml(plan: any): string {
    const clinicName = getBranchPrintName(plan.branch || plan.patient.branch);
    const logo = getLogoDataUri();

    const complaintsHtml = plan.complaints?.length
      ? `<ul class="plain-list">${plan.complaints.map((c: string) => `<li>${esc(c)}</li>`).join('')}</ul>`
      : '<div class="muted">Nuk ka ankesa të regjistruara</div>';

    const sessionsRows = plan.sessions.length
      ? plan.sessions.map((s: any) => `
          <tr>
            <td>${s.sessionNumber ?? '—'}</td>
            <td>${dayjs(s.completedAt || s.scheduledAt || s.createdAt).format('DD/MM/YYYY')}</td>
            <td>${s.status === 'COMPLETED' ? 'E kompletuar' : esc(s.status)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="3">Nuk ka seanca ende</td></tr>';

    return `<!DOCTYPE html>
<html lang="sq">
<head>
<meta charset="UTF-8" />
<title>Trajtimi i ${esc(plan.patient.firstName)} ${esc(plan.patient.lastName)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; }
  ${HEADER_CSS}
  .section { margin-bottom: 18px; }
  .section-title { font-size: 13px; font-weight: 700; color: #0f766e; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; font-size: 12px; }
  .info-grid div span.label { color: #64748b; }
  .plain-list { margin: 0; padding-left: 18px; font-size: 12px; }
  .muted { font-size: 12px; color: #94a3b8; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table th { text-align: left; background: #f1f5f9; color: #475569; padding: 6px 8px; font-size: 10px; text-transform: uppercase; }
  table td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
  .notes { font-size: 12px; color: #374151; background: #f8fafc; padding: 10px; border-radius: 6px; margin-top: 8px; white-space: pre-wrap; }
  .progress-bar { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin-top: 6px; }
  .progress-fill { height: 100%; background: #0f766e; }
  .footer { margin-top: 36px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  ${buildHeaderHtml(clinicName, 'PLANI I TRAJTIMIT', dayjs(plan.createdAt).format('DD/MM/YYYY HH:mm'), logo)}

  <div class="section">
    <div class="section-title">Të dhënat e klientit</div>
    <div class="info-grid">
      <div><span class="label">Emri:</span> ${esc(plan.patient.firstName)} ${esc(plan.patient.lastName)}</div>
      <div><span class="label">Telefoni:</span> ${esc(plan.patient.phone)}</div>
      <div><span class="label">Dega:</span> ${esc(plan.branch?.name || plan.patient.branch?.name)}</div>
      ${plan.assignedPhysiotherapist ? `<div><span class="label">Fizioterapeuti:</span> ${esc(plan.assignedPhysiotherapist.firstName)} ${esc(plan.assignedPhysiotherapist.lastName)}</div>` : ''}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Ankesat kryesore</div>
    ${complaintsHtml}
    ${plan.complaintDescription ? `<div class="notes" style="margin-top:10px;">${esc(plan.complaintDescription)}</div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">Plani i trajtimit</div>
    <div class="info-grid">
      <div><span class="label">Diagnoza:</span> ${esc(plan.diagnosis || '—')}</div>
      <div><span class="label">Llojet e trajtimit:</span> ${esc((plan.treatmentTypes || []).join(', ') || '—')}</div>
      <div><span class="label">Diagnozat e konsideruara:</span> ${esc((plan.selectedDiagnoses || []).join(', ') || '—')}</div>
      <div><span class="label">Numri i seancave:</span> ${plan.totalSessions}</div>
    </div>
    <table style="margin-top:10px;">
      <thead><tr><th>Nr.</th><th>Data</th><th>Statusi</th></tr></thead>
      <tbody>${sessionsRows}</tbody>
    </table>
  </div>

  ${plan.notes ? `<div class="section"><div class="section-title">Përshkrim</div><div class="notes">${esc(plan.notes)}</div></div>` : ''}

  <div class="section">
    <div class="section-title">Progresi</div>
    <div class="info-grid"><div>${plan.completedSessions}/${plan.totalSessions} seanca të kryera</div></div>
    <div class="progress-bar"><div class="progress-fill" style="width:${plan.totalSessions ? Math.min(100, (plan.completedSessions / plan.totalSessions) * 100) : 0}%;"></div></div>
  </div>

  <div class="footer">
    Faleminderit që zgjodhët ${esc(clinicName)}!<br />
    Gjeneruar: ${dayjs().format('DD/MM/YYYY HH:mm')}
  </div>
</body>
</html>`;
  }

  async generateSessionReportPdf(sessionId: string, res: Response) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, deletedAt: null },
      include: {
        patient: { include: { branch: true } },
        branch: true,
        physiotherapist: true,
        completedByUser: true,
        treatmentPlan: true,
        treatments: { where: { deletedAt: null } },
      },
    });
    if (!session) throw new NotFoundException('Seanca nuk u gjet');

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=trajtimi-${session.id.slice(0, 8)}.pdf`);
    doc.pipe(res);

    this.drawSessionReport(doc, session);
    doc.end();
  }

  // Shared 3-column header for every PDFKit document: left = branch-based
  // clinic name (alone, never beside the logo), center = logo (in its own
  // column so it's genuinely centered regardless of how long the clinic
  // name or title text is), right = document title + date. Mirrors
  // buildHeaderHtml's layout exactly so the HTML "Shfaq" view and the
  // downloaded PDF always match.
  private drawHeader(
    doc: typeof PDFDocument.prototype,
    title: string,
    clinicName: string = APP_NAME,
    dateLabel: string = dayjs().format('DD/MM/YYYY HH:mm'),
  ) {
    const left = 50;
    const right = 545;
    const colWidth = (right - left) / 3;
    const logoWidth = 60;

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f766e')
      .text(clinicName, left, 56, { width: colWidth, align: 'left' });

    try {
      doc.image(LOGO_PATH, doc.page.width / 2 - logoWidth / 2, 38, { width: logoWidth });
    } catch {
      /* logo asset missing — header still renders without it */
    }

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#1e293b')
      .text(title, left + colWidth * 2, 48, { width: colWidth, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor('#64748b')
      .text(dateLabel, left + colWidth * 2, 66, { width: colWidth, align: 'right' });

    doc.moveTo(50, 112).lineTo(545, 112).stroke('#e2e8f0');
  }

  private drawInvoice(doc: typeof PDFDocument.prototype, payment: any, financials: ReturnType<typeof computePlanFinancials> | null) {
    this.drawHeader(doc, `FATURË Nr. ${payment.invoiceNumber}`, getBranchPrintName(payment.branch), dayjs(payment.createdAt).format('DD/MM/YYYY HH:mm'));

    let y = 132;

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151');
    doc.text(`Statusi:`, 50, y);
    const status = financials?.paymentStatus || payment.status;
    const statusColor = status === 'PAID' ? '#16a34a' : status === 'PARTIALLY_PAID' ? '#d97706' : '#dc2626';
    doc.font('Helvetica-Bold').fillColor(statusColor).text(STATUS_LABELS[status] || status, 180, y);
    y += 24;

    doc.moveTo(50, y).lineTo(545, y).stroke('#e2e8f0');
    y += 10;

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1e293b').text('Pacienti', 50, y);
    y += 16;
    doc.font('Helvetica').fontSize(10).fillColor('#374151');
    doc.text(`Emri:`, 50, y).text(`${payment.patient.firstName} ${payment.patient.lastName}`, 180, y);
    y += 14;
    doc.text(`Telefoni:`, 50, y).text(payment.patient.phone, 180, y);
    y += 14;
    doc.text(`Dega:`, 50, y).text(payment.branch.name, 180, y);
    y += 14;
    if (payment.treatmentPlan?.assignedPhysiotherapist) {
      const p = payment.treatmentPlan.assignedPhysiotherapist;
      doc.text(`Fizioterapeuti:`, 50, y).text(`${p.firstName} ${p.lastName}`, 180, y);
      y += 14;
    }
    if (payment.treatmentPlan?.createdByUser) {
      const c = payment.treatmentPlan.createdByUser;
      doc.text(`Regjistruar nga:`, 50, y).text(`${c.firstName} ${c.lastName}`, 180, y);
      y += 14;
    }
    y += 10;

    doc.moveTo(50, y).lineTo(545, y).stroke('#e2e8f0');
    y += 10;
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1e293b').text('Shërbimet', 50, y);
    y += 16;

    if (payment.treatmentPlan && financials) {
      const plan = payment.treatmentPlan;
      const fee = Number(plan.sessionFee);

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#64748b');
      doc.text('Shërbimi', 50, y).text('Seancat', 280, y).text('Çmimi', 400, y).text('Totali', 470, y);
      y += 14;
      doc.moveTo(50, y).lineTo(545, y).stroke('#e2e8f0');
      y += 8;

      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      doc.text('Trajtim/seancë', 50, y).text(`${plan.totalSessions}`, 280, y).text(`${fee.toFixed(2)}€`, 400, y).text(`${(plan.totalSessions * fee).toFixed(2)}€`, 470, y);
      y += 14;

      y += 4;
      doc.moveTo(50, y).lineTo(545, y).stroke('#e2e8f0');
      y += 10;

      const rows: [string, string, string?][] = [
        ['Totali i trajtimit', `${financials.totalTreatmentValue.toFixed(2)}€`],
        ['Seanca të kryera', `${financials.completedSessionsCount}/${financials.totalSessions}`],
        ['Vlera e seancave të kryera', `${financials.currentEarnedAmount.toFixed(2)}€`],
        ['Shuma e paguar', `${financials.totalPaidAmount.toFixed(2)}€`, '#16a34a'],
        ['Borxhi aktual', `${financials.currentDebt.toFixed(2)}€`, financials.currentDebt > 0 ? '#dc2626' : '#16a34a'],
        ['Balanca e mbetur finale', `${financials.finalRemainingBalance.toFixed(2)}€`, financials.finalRemainingBalance > 0 ? '#dc2626' : '#16a34a'],
      ];
      for (const [label, value, color] of rows) {
        doc.font('Helvetica-Bold').fillColor('#1e293b').text(`${label}:`, 300, y);
        doc.font('Helvetica').fillColor(color || '#374151').text(value, 470, y);
        y += 16;
      }
    }

    doc.moveTo(50, y).lineTo(545, y).stroke('#0f766e');
    y += 10;
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f766e');
    doc.text('Kjo pagesë:', 350, y).text(`${Number(payment.amount).toFixed(2)}€`, 470, y);
    y += 30;

    if (payment.notes) {
      doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(`Shënime: ${payment.notes}`, 50, y);
      y += 20;
    }

    const clinicName = getBranchPrintName(payment.branch);
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
      .text(`Faleminderit që zgjodhët ${clinicName}!`, 50, 750, { align: 'center', width: 495 })
      .text(`Gjeneruar: ${dayjs().format('DD/MM/YYYY HH:mm')}`, 50, 762, { align: 'center', width: 495 });
  }

  private renderInvoiceHtml(payment: any, financials: ReturnType<typeof computePlanFinancials> | null): string {
    const plan = payment.treatmentPlan;
    const status = financials?.paymentStatus || payment.status;
    const statusColor = status === 'PAID' ? '#16a34a' : status === 'PARTIALLY_PAID' ? '#d97706' : '#dc2626';
    const clinicName = getBranchPrintName(payment.branch);
    const logo = getLogoDataUri();

    const servicesRows = plan
      ? `<tr><td>Trajtim/seancë</td><td>${plan.totalSessions}</td><td>${Number(plan.sessionFee).toFixed(2)}€</td><td>${(plan.totalSessions * Number(plan.sessionFee)).toFixed(2)}€</td></tr>`
      : '<tr><td colspan="4">Pagesë pa plan trajtimi specifik</td></tr>';

    const financialsRows = financials
      ? `
        <tr><td>Totali i trajtimit</td><td>${financials.totalTreatmentValue.toFixed(2)}€</td></tr>
        <tr><td>Seanca të kryera</td><td>${financials.completedSessionsCount}/${financials.totalSessions}</td></tr>
        <tr><td>Vlera e seancave të kryera</td><td>${financials.currentEarnedAmount.toFixed(2)}€</td></tr>
        <tr><td>Shuma e paguar</td><td class="green">${financials.totalPaidAmount.toFixed(2)}€</td></tr>
        <tr><td>Borxhi aktual</td><td class="${financials.currentDebt > 0 ? 'red' : 'green'}">${financials.currentDebt.toFixed(2)}€</td></tr>
        <tr class="total-row"><td>Balanca e mbetur finale</td><td class="${financials.finalRemainingBalance > 0 ? 'red' : 'green'}">${financials.finalRemainingBalance.toFixed(2)}€</td></tr>
      `
      : '';

    return `<!DOCTYPE html>
<html lang="sq">
<head>
<meta charset="UTF-8" />
<title>Fatura ${esc(payment.invoiceNumber)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; }
  ${HEADER_CSS}
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; color: white; background: ${statusColor}; margin-top: 6px; }
  .section { margin-bottom: 18px; }
  .section-title { font-size: 13px; font-weight: 700; color: #0f766e; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; font-size: 12px; }
  .info-grid div span.label { color: #64748b; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table th { text-align: left; background: #f1f5f9; color: #475569; padding: 6px 8px; font-size: 10px; text-transform: uppercase; }
  table td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
  .financials td:first-child { color: #475569; }
  .financials td:last-child { text-align: right; font-weight: 600; }
  .total-row td { font-weight: 700; font-size: 13px; border-top: 2px solid #0f766e; }
  .green { color: #16a34a; }
  .red { color: #dc2626; }
  .notes { font-size: 11px; color: #64748b; background: #f8fafc; padding: 10px; border-radius: 6px; margin-top: 12px; }
  .footer { margin-top: 36px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  ${buildHeaderHtml(
    clinicName,
    `FATURË Nr. ${payment.invoiceNumber}`,
    dayjs(payment.createdAt).format('DD/MM/YYYY HH:mm'),
    logo,
    `<div><span class="status-badge">${esc(STATUS_LABELS[status] || status)}</span></div>`,
  )}

  <div class="section">
    <div class="section-title">Pacienti</div>
    <div class="info-grid">
      <div><span class="label">Emri:</span> ${esc(payment.patient.firstName)} ${esc(payment.patient.lastName)}</div>
      <div><span class="label">Telefoni:</span> ${esc(payment.patient.phone)}</div>
      <div><span class="label">Dega:</span> ${esc(payment.branch?.name)}</div>
      ${plan?.assignedPhysiotherapist ? `<div><span class="label">Fizioterapeuti:</span> ${esc(plan.assignedPhysiotherapist.firstName)} ${esc(plan.assignedPhysiotherapist.lastName)}</div>` : ''}
      ${plan?.createdByUser ? `<div><span class="label">Regjistruar nga:</span> ${esc(plan.createdByUser.firstName)} ${esc(plan.createdByUser.lastName)}</div>` : ''}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Shërbimet</div>
    <table>
      <thead><tr><th>Shërbimi</th><th>Seancat</th><th>Çmimi</th><th>Totali</th></tr></thead>
      <tbody>${servicesRows}</tbody>
    </table>
  </div>

  ${financials ? `
  <div class="section">
    <div class="section-title">Përmbledhja financiare</div>
    <table class="financials"><tbody>${financialsRows}</tbody></table>
  </div>` : ''}

  <div class="section">
    <table class="financials"><tbody>
      <tr class="total-row"><td>Kjo pagesë</td><td>${Number(payment.amount).toFixed(2)}€</td></tr>
    </tbody></table>
  </div>

  ${payment.notes ? `<div class="notes"><strong>Shënime:</strong> ${esc(payment.notes)}</div>` : ''}

  <div class="footer">
    Faleminderit që zgjodhët ${esc(clinicName)}!<br />
    Gjeneruar: ${dayjs().format('DD/MM/YYYY HH:mm')}
  </div>
</body>
</html>`;
  }

  private drawSessionReport(doc: typeof PDFDocument.prototype, session: any) {
    const clinicName = getBranchPrintName(session.branch);
    const dateLabel = dayjs(session.completedAt || session.scheduledAt || session.createdAt).format('DD/MM/YYYY HH:mm');
    this.drawHeader(doc, 'RAPORT TRAJTIMI', clinicName, dateLabel);

    let y = 132;

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151');
    doc.text('Data:', 50, y).text(session.scheduledAt ? dayjs(session.scheduledAt).format('DD/MM/YYYY HH:mm') : 'Pa datë', 180, y);
    y += 16;
    doc.text('Statusi:', 50, y).text(session.status === 'COMPLETED' ? 'E kompletuar' : session.status, 180, y);
    y += 16;
    doc.text('Kohëzgjatja:', 50, y).text(session.duration ? `${session.duration} min` : 'N/A', 180, y);
    y += 16;
    doc.text('Niveli i dhembjes:', 50, y).text(session.painLevel ? `${session.painLevel}/10` : 'N/A', 180, y);
    y += 24;

    doc.moveTo(50, y).lineTo(545, y).stroke('#e2e8f0');
    y += 10;

    doc.font('Helvetica-Bold').fontSize(11).text('Pacienti', 50, y);
    y += 16;
    doc.font('Helvetica').fontSize(10);
    doc.text(`${session.patient.firstName} ${session.patient.lastName}`, 50, y);
    y += 14;
    doc.text(`Tel: ${session.patient.phone}`, 50, y);
    y += 14;
    doc.text(`Dega: ${session.branch.name}`, 50, y);
    y += 24;

    doc.moveTo(50, y).lineTo(545, y).stroke('#e2e8f0');
    y += 10;
    doc.font('Helvetica-Bold').fontSize(11).text('Fizioterapeuti', 50, y);
    y += 16;
    doc.font('Helvetica').fontSize(10);
    {
      // Prefer the assigned physiotherapist; fall back to whoever actually
      // completed/recorded the session (often an Admin) before giving up.
      const recorder = session.physiotherapist || session.completedByUser;
      doc.text(recorder ? `${recorder.firstName} ${recorder.lastName}` : 'Nuk është caktuar', 50, y);
    }
    y += 24;

    if (session.treatments?.length > 0) {
      doc.moveTo(50, y).lineTo(545, y).stroke('#e2e8f0');
      y += 10;
      doc.font('Helvetica-Bold').fontSize(11).text('Trajtimet', 50, y);
      y += 16;
      for (const t of session.treatments) {
        doc.font('Helvetica').fontSize(9);
        doc.text(`• ${t.treatmentTypes.join(', ')}`, 60, y);
        y += 12;
      }
      y += 10;
    }

    if (session.notes) {
      doc.font('Helvetica-Bold').fontSize(10).text('Shënime:', 50, y);
      y += 14;
      doc.font('Helvetica').fontSize(9).fillColor('#374151').text(session.notes, 60, y, { width: 480 });
      y += 30;
    }

    if (session.recommendations) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Rekomandime:', 50, y);
      y += 14;
      doc.font('Helvetica').fontSize(9).fillColor('#374151').text(session.recommendations, 60, y, { width: 480 });
      y += 30;
    }

    // Progress lives below Rekomandime, at the bottom of the body — never in
    // the header — same placement as the Kontrollë print.
    if (session.treatmentPlan) {
      doc.moveTo(50, y).lineTo(545, y).stroke('#e2e8f0');
      y += 10;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('Progresi:', 50, y);
      doc.font('Helvetica').fontSize(10).fillColor('#374151')
        .text(`${session.treatmentPlan.completedSessions}/${session.treatmentPlan.totalSessions} seanca`, 120, y);
    }

    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
      .text(`Gjeneruar: ${dayjs().format('DD/MM/YYYY HH:mm')} | ${clinicName}`, 50, 750, { align: 'center', width: 495 });
  }
}
