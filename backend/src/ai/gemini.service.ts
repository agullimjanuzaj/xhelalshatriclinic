import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

export interface GeneratePlanInput {
  diagnosis: string;
  treatmentTypes: string[];
  totalSessions?: number;
  existingNotes?: string;
  complaints?: string[];
  selectedDiagnoses?: string[];
}

export interface GenerateRecommendationInput {
  notes?: string;
  treatmentTypes?: string[];
}

export interface GenerateComplaintDescriptionInput {
  complaints: string[];
  category?: string;
}

export interface AiResult {
  text: string;
  source: 'gemini' | 'fallback';
}

const TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Gemini timeout after ${ms}ms`)), ms),
    ),
  ]);
}

// Accumulates all text chunks from a Gemini streaming response.
// Streaming is used instead of generateContent so that:
// 1. Every chunk's text is concatenated — no partial-response truncation.
// 2. The SDK's per-chunk .text() correctly filters out thought parts for
//    gemini-2.5-flash, which uses thinking tokens by default. Without
//    streaming, result.response.text() may concatenate thought tokens with
//    the answer, or — when maxOutputTokens is too low — thinking consumes
//    the budget leaving almost no tokens for the actual answer.
async function streamToText(model: GenerativeModel, prompt: string): Promise<string> {
  const result = await model.generateContentStream(prompt);
  let fullText = '';
  for await (const chunk of result.stream) {
    const part = chunk.text();
    if (part) fullText += part;
  }
  return fullText.trim();
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly model: GenerativeModel | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not configured — template fallback will be used for all generation');
      return;
    }
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        // Cast as any: thinkingConfig is not yet in the SDK's TS types but
        // IS accepted by the API. Setting thinkingBudget:0 prevents the
        // model's chain-of-thought from consuming the maxOutputTokens budget,
        // which is what caused very-short truncated responses.
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 1000,
          thinkingConfig: { thinkingBudget: 0 },
        } as any,
      });
      this.logger.log('GeminiService ready (model: gemini-2.5-flash)');
    } catch (err) {
      this.logger.error(`Failed to initialise Gemini client: ${(err as Error).message}`);
    }
  }

  async generateTreatmentPlan(input: GeneratePlanInput): Promise<string | null> {
    if (!this.model) return null;
    const start = Date.now();
    try {
      const prompt = this.buildTreatmentPlanPrompt(input);
      const text = await withTimeout(streamToText(this.model, prompt), TIMEOUT_MS);
      if (!text) throw new Error('Empty response from Gemini');
      this.logger.log(`Treatment plan generated (${Date.now() - start}ms, ${text.length} chars)`);
      return text;
    } catch (err) {
      this.logger.error(`Treatment plan generation failed (${Date.now() - start}ms): ${(err as Error).message}`);
      return null;
    }
  }

  async generateComplaintDescription(input: GenerateComplaintDescriptionInput): Promise<string | null> {
    if (!this.model) return null;
    const start = Date.now();
    try {
      const prompt = this.buildComplaintDescriptionPrompt(input);
      const text = await withTimeout(streamToText(this.model, prompt), TIMEOUT_MS);
      if (!text) throw new Error('Empty response from Gemini');
      this.logger.log(`Complaint description generated (${Date.now() - start}ms, ${text.length} chars)`);
      return text;
    } catch (err) {
      this.logger.error(`Complaint description generation failed (${Date.now() - start}ms): ${(err as Error).message}`);
      return null;
    }
  }

  async generateRecommendation(input: GenerateRecommendationInput): Promise<string | null> {
    if (!this.model) return null;
    const start = Date.now();
    try {
      const prompt = this.buildRecommendationPrompt(input);
      const text = await withTimeout(streamToText(this.model, prompt), TIMEOUT_MS);
      if (!text) throw new Error('Empty response from Gemini');
      this.logger.log(`Recommendation generated (${Date.now() - start}ms, ${text.length} chars)`);
      return text;
    } catch (err) {
      this.logger.error(`Recommendation generation failed (${Date.now() - start}ms): ${(err as Error).message}`);
      return null;
    }
  }

  private buildTreatmentPlanPrompt(input: GeneratePlanInput): string {
    const { diagnosis, treatmentTypes, totalSessions, existingNotes, complaints, selectedDiagnoses } = input;

    const lines: string[] = [
      'Ti je një fizioterapeut klinik me mbi 10 vjet përvojë, i specializuar në rehabilitim muskuloskeletar dhe neuromotor.',
      '',
      'Harton planin e trajtimit për pacientin me të dhënat e mëposhtme:',
      `- Diagnoza finale: ${diagnosis}`,
    ];

    if (complaints?.length) lines.push(`- Ankesat kryesore të raportuar: ${complaints.join(', ')}`);
    if (selectedDiagnoses?.length) lines.push(`- Konsideratat diagnostikuese: ${selectedDiagnoses.join(', ')}`);
    if (treatmentTypes.length) lines.push(`- Metodat e trajtimit të zgjedhura: ${treatmentTypes.join(', ')}`);
    if (totalSessions) lines.push(`- Numri i seancave të planifikuara: ${totalSessions}`);
    if (existingNotes?.trim()) lines.push(`- Shënime klinike shtesë: ${existingNotes.trim()}`);

    lines.push(
      '',
      'Shkruaj planin e trajtimit në shqip si narrativ klinik profesional (150-250 fjalë) që:',
      '1. Paraqet qartë fokusim terapeutik sipas diagnozës specifike',
      '2. Përshkruan metodat e trajtimit dhe arsyen klinike të zgjedhjes së tyre',
      '3. Skicon progresionin e trajtimit në faza (nga passive/aktive drejt funksionale)',
      '4. Integron numrin e seancave në strukturën e planit',
      '5. Është i personalizuar — shmangu fraza të banalitetit si "plani i trajtimit fokusohet në..."',
      '6. Shkruhet si tekst i vazhdueshëm, plain text (pa pika liste, pa markdown, pa numërime)',
      '7. Nuk shpik simptoma, diagnoza ose detaje klinike që nuk janë dhënë',
      '8. Fillon direkt me planin — pa hyrje si "Sigurisht", "Natyrisht", "Mirë", etj.',
      '9. Nuk përfshin disclaimer-a ose shënime mbi rolin e AI',
      '',
      'Shkruaje direkt planin (plain text, 150-250 fjalë):',
    );

    return lines.join('\n');
  }

  private buildComplaintDescriptionPrompt(input: GenerateComplaintDescriptionInput): string {
    const { complaints, category } = input;
    const CATEGORY_LABELS: Record<string, string> = {
      CERVIKALE: 'Cervikale (qafë/qafëzë)',
      TORAKALE: 'Torakale (shpinë e sipërme)',
      LOMBOSAKRALE: 'Lombosakrale (mesi/shpina e poshtme)',
      KRAHU: 'Krahu dhe shpatulla',
      BERRYLI: 'Bërryli',
      KYCI: 'Kyçi (dore ose këmbe)',
      KERDHOKULLA: 'Kërdhokulla (ijë/pelvik)',
      GJURI: 'Gjuri',
      SHPUTA: 'Shputa dhe zogu i këmbës',
    };
    const lines = [
      'Ti je një fizioterapeut klinik që dokumenton historikun e ankesave të pacientit.',
      '',
      'Ankesat e zgjedhura nga pacienti:',
      ...complaints.map((c) => `- ${c}`),
      '',
    ];
    if (category && CATEGORY_LABELS[category]) {
      lines.push(`Rajoni anatomik: ${CATEGORY_LABELS[category]}`, '');
    }
    lines.push(
      'Shkruaj një përshkrim klinik të shkurtër (1-3 fjali) VETËM bazuar në ankesat e mësipërme.',
      '',
      'Rregulla strikte:',
      '- Mos shpik diagnozë',
      '- Mos shkruaj plan trajtimi',
      '- Mos jep rekomandime',
      '- Mos shto simptoma ose detaje që nuk janë dhënë',
      '- Tekst i vazhdueshëm, plain text (pa markdown, pa lista, pa numërime)',
      '- Gjuhë shqipe profesionale klinike',
      '- Pa hyrje si "Sigurisht", "Natyrisht", "Mirë" — fillo direkt me përshkrimin',
      '- Pa disclaimer-a mbi rolin e AI',
      '',
      'Shkruaje direkt përshkrimin (plain text, 1-3 fjali):',
    );
    return lines.join('\n');
  }

  private buildRecommendationPrompt(input: GenerateRecommendationInput): string {
    const { notes, treatmentTypes } = input;

    const lines: string[] = [
      'Ti je një fizioterapeut klinik që po shkruan rekomandimet post-seancë për pacientin.',
      '',
      'Të dhënat e seancës së sapo kryer:',
    ];

    if (notes?.trim()) lines.push(`- Shënim klinik i seancës: ${notes.trim()}`);
    if (treatmentTypes?.length) lines.push(`- Trajtimet e kryera: ${treatmentTypes.join(', ')}`);

    lines.push(
      '',
      'Shkruaj rekomandimet post-seancë në shqip (80-130 fjalë) që:',
      '1. Bazohen specifikisht tek shënimi klinik dhe trajtimet e kryera',
      '2. Japin udhëzime praktike dhe konkrete për kujdesin shtëpiak',
      '3. Janë të personalizuara sipas gjendjes specifike të përshkruar',
      '4. Përfshijnë këshilla posturale ose aktiviteti nëse janë relevante',
      '5. Nuk shpikin simptoma ose diagnoza të reja',
      '6. Nuk fillojnë me fjalë ndihmuese ("Sigurisht", "Natyrisht", "Në vijim", etj.)',
      '7. Shkruhen si paragraf i vazhdueshëm, plain text (jo listë, jo markdown)',
      '8. Nuk përfshijnë disclaimer-a mbi rolin e AI',
      '',
      'Shkruaje direkt rekomandimin (plain text, 80-130 fjalë):',
    );

    return lines.join('\n');
  }
}
