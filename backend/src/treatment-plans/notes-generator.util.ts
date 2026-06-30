// Template-based draft generator (no external AI service configured for
// this project) — assembles a ready-to-use professional Albanian treatment
// plan narrative ("Plani i tretmanit") from the diagnosis, the selected main
// complaints, the checked suggested diagnoses, the selected treatment types,
// the session count, and any existing notes. Reads as a clinician's plan,
// not a labeled/technical list, and carries no disclaimer — the
// physiotherapist or admin reviews and edits it before saving either way.
export function generateTreatmentPlanNotes(
  diagnosis: string,
  treatmentTypes: string[],
  totalSessions?: number,
  existingNotes?: string,
  complaints?: string[],
  selectedDiagnoses?: string[],
): string {
  const methodsList = treatmentTypes.length ? treatmentTypes.join(', ') : 'teknika të përshtatshme fizioterapie';

  const sentences: string[] = [
    `Plani i trajtimit fokusohet në trajtimin e ${diagnosis.trim()}, duke synuar uljen e dhimbjes, përmirësimin e lëvizshmërisë dhe rikthimin gradual të funksionit.`,
  ];

  if (complaints?.length) {
    sentences.push(`Ankesat kryesore të identifikuara janë: ${complaints.join(', ')}.`);
  }

  if (selectedDiagnoses?.length) {
    sentences.push(`Bazuar në vlerësimin klinik, konsiderohen diagnozat: ${selectedDiagnoses.join(', ')}.`);
  }

  if (totalSessions && totalSessions > 0) {
    sentences.push(`Plani përfshin gjithsej ${totalSessions} seanca, të organizuara në mënyrë progresive sipas përgjigjes së pacientit ndaj trajtimit.`);
  }

  sentences.push(
    `Në seancat e para rekomandohet punë e kontrolluar me ${methodsList}, duke monitoruar reagimin e pacientit pas çdo seance.`,
    'Me përmirësimin e simptomave, trajtimi mund të kalojë gradualisht në ushtrime aktive, stabilizim dhe forcim funksional.',
  );

  if (existingNotes?.trim()) {
    sentences.push(`Duke marrë parasysh shënimet ekzistuese (${existingNotes.trim()}), trajtimi përshtatet sipas nevojave specifike të pacientit.`);
  }

  sentences.push('Pacienti këshillohet të shmangë ngarkesat e tepërta dhe të ndjekë rekomandimet e dhëna pas çdo seance.');

  return sentences.join(' ');
}
