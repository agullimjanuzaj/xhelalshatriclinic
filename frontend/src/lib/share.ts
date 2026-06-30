import { toast } from 'sonner';

// Generic share — lets the user pick whichever app they want (WhatsApp,
// Viber, Messages, email, ...) via the OS share sheet on mobile/supporting
// browsers, falling back to a clipboard copy everywhere else. Never tied to
// one specific app.
export async function shareText(text: string, title?: string) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text, title });
      return;
    } catch (err: any) {
      if (err?.name === 'AbortError') return; // user cancelled the share sheet — not an error
      // fall through to the clipboard fallback below
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Teksti u kopjua — ngjiteni në aplikacionin që dëshironi');
      return;
    } catch {
      // fall through
    }
  }

  toast.error('Ndarja nuk u mbështet në këtë shfletues. Kopjoni tekstin manualisht.');
}

export function buildInvoiceShareText(params: {
  patientName: string;
  invoiceNumber: string;
  amount: number;
  branchName?: string;
  currentDebt?: number;
  paidAt?: string | Date;
  clinicName?: string;
}): string {
  const { patientName, invoiceNumber, amount, branchName, currentDebt, paidAt, clinicName = 'Xhelal Shatri Clinic' } = params;
  const date = paidAt ? new Date(paidAt) : new Date();
  const dateStr = date.toLocaleDateString('sq-AL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const lines = [clinicName, `Fatura Nr. ${invoiceNumber}`, '', `Pacienti: ${patientName}`];
  if (branchName) lines.push(`Dega: ${branchName}`);
  lines.push(`Shuma e paguar: ${amount.toFixed(2)}€`);
  if (currentDebt !== undefined) {
    lines.push(currentDebt > 0 ? `Borxhi aktual: ${currentDebt.toFixed(2)}€` : 'Borxhi aktual: 0€ (pa borxh)');
  }
  lines.push(`Data: ${dateStr}`, '', 'Faleminderit që zgjodhët klinikën tonë!');
  return lines.join('\n');
}

export function buildSessionShareText(params: {
  patientName: string;
  sessionNumber?: number | null;
  totalSessions?: number;
  date?: string | Date;
  physiotherapistName?: string;
  treatmentTypes?: string[];
  notes?: string;
  recommendations?: string;
  clinicName?: string;
}): string {
  const { patientName, sessionNumber, totalSessions, date, physiotherapistName, treatmentTypes, notes, recommendations, clinicName = 'Xhelal Shatri Clinic' } = params;
  const dateStr = (date ? new Date(date) : new Date()).toLocaleDateString('sq-AL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const lines = [clinicName, 'Raport Seance', '', `Pacienti: ${patientName}`];
  if (sessionNumber && totalSessions) lines.push(`Seanca: ${sessionNumber}/${totalSessions}`);
  if (physiotherapistName) lines.push(`Fizioterapeuti: ${physiotherapistName}`);
  if (treatmentTypes?.length) lines.push(`Llojet e trajtimit: ${treatmentTypes.join(', ')}`);
  lines.push(`Data: ${dateStr}`);
  if (notes) lines.push('', `Përshkrimi: ${notes}`);
  if (recommendations) lines.push('', `Rekomandime: ${recommendations}`);
  lines.push('', 'Faleminderit që zgjodhët klinikën tonë!');
  return lines.join('\n');
}

export function buildTreatmentShareText(params: {
  patientName: string;
  diagnosis?: string;
  treatmentTypes?: string[];
  totalSessions: number;
  completedSessions: number;
  totalTreatmentValue: number;
  totalPaidAmount: number;
  currentDebt: number;
  clinicName?: string;
}): string {
  const {
    patientName, diagnosis, treatmentTypes, totalSessions, completedSessions,
    totalTreatmentValue, totalPaidAmount, currentDebt, clinicName = 'Xhelal Shatri Clinic',
  } = params;

  const lines = [clinicName, 'Plani i Trajtimit', '', `Pacienti: ${patientName}`];
  if (diagnosis) lines.push(`Diagnoza: ${diagnosis}`);
  if (treatmentTypes?.length) lines.push(`Llojet e trajtimit: ${treatmentTypes.join(', ')}`);
  lines.push(
    `Seancat: ${completedSessions}/${totalSessions}`,
    `Totali i trajtimit: ${totalTreatmentValue.toFixed(2)}€`,
    `Shuma e paguar: ${totalPaidAmount.toFixed(2)}€`,
    currentDebt > 0 ? `Borxhi aktual: ${currentDebt.toFixed(2)}€` : 'Borxhi aktual: 0€ (pa borxh)',
    '', 'Faleminderit që zgjodhët klinikën tonë!',
  );
  return lines.join('\n');
}
