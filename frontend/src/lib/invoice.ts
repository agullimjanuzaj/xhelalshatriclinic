import { pdfApi } from '@/lib/api';
import { toast } from 'sonner';

function friendlyError(err: any): string {
  if (err?.response?.status === 401 || /401|unauthorized/i.test(err?.message || '')) {
    return 'Sesioni ka skaduar. Kyçuni përsëri.';
  }
  if (err?.response?.status === 403) {
    return 'Nuk keni qasje në këtë faturë.';
  }
  return err?.message || 'Ndodhi një gabim gjatë gjenerimit të faturës.';
}

export async function downloadInvoicePdf(paymentId: string, invoiceNumber: string) {
  try {
    const blob = (await pdfApi.downloadInvoicePdf(paymentId)) as unknown as Blob;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fatura-${invoiceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err: any) {
    toast.error(friendlyError(err));
  }
}

// Opens a real, titled document in the new window/tab instead of leaving it
// on the browser's default "about:blank" — the title is set immediately
// (before document.write parses the body), and the HTML's own <title> tag
// confirms/overrides it the instant parsing reaches <head>, so the tab never
// shows a blank/untitled state at any point, not just after load.
function openHtmlInWindow(html: string, title: string, autoPrint: boolean) {
  const win = window.open('', '_blank');
  if (!win) {
    toast.error('Shfletuesi bllokoi dritaren. Lejoni pop-ups për ta vazhduar.');
    return;
  }
  win.document.open();
  win.document.title = title;
  win.document.write(html);
  win.document.close();
  if (autoPrint) {
    win.onload = () => {
      win.focus();
      win.print();
    };
  }
}

function openHtmlForPrint(html: string, title: string) {
  openHtmlInWindow(html, title, true);
}

export async function showSessionReport(sessionId: string) {
  try {
    const html = (await pdfApi.getSessionReportHtml(sessionId)) as unknown as string;
    openHtmlInWindow(html, 'Raport Trajtimi', false);
  } catch (err: any) {
    toast.error(friendlyError(err));
  }
}

export async function showTreatmentPlan(planId: string) {
  try {
    const html = (await pdfApi.getTreatmentPlanHtml(planId)) as unknown as string;
    openHtmlInWindow(html, 'Plani i Trajtimit', false);
  } catch (err: any) {
    toast.error(friendlyError(err));
  }
}

export async function printInvoice(paymentId: string) {
  try {
    const html = (await pdfApi.getInvoiceHtml(paymentId)) as unknown as string;
    openHtmlForPrint(html, 'Faturë');
  } catch (err: any) {
    toast.error(friendlyError(err));
  }
}

export async function printSessionReport(sessionId: string) {
  try {
    const html = (await pdfApi.getSessionReportHtml(sessionId)) as unknown as string;
    openHtmlForPrint(html, 'Raport Trajtimi');
  } catch (err: any) {
    toast.error(friendlyError(err));
  }
}

export async function printTreatmentPlan(planId: string) {
  try {
    const html = (await pdfApi.getTreatmentPlanHtml(planId)) as unknown as string;
    openHtmlForPrint(html, 'Plani i Trajtimit');
  } catch (err: any) {
    toast.error(friendlyError(err));
  }
}

export async function getSessionReportHtml(sessionId: string): Promise<string> {
  return (await pdfApi.getSessionReportHtml(sessionId)) as unknown as string;
}

export async function getTreatmentPlanHtml(planId: string): Promise<string> {
  return (await pdfApi.getTreatmentPlanHtml(planId)) as unknown as string;
}
