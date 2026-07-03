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

// Timeout for Gemini API calls — stays well within the NestJS request timeout
// and prevents the user from waiting indefinitely if the API is slow.
const TIMEOUT_MS = 10_000;

// Wraps a promise with a timeout. Rejects with a timeout error if the wrapped
// promise hasn't resolved within TIMEOUT_MS milliseconds.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Gemini timeout after ${ms}ms`)), ms)),
  ]);
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
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 512,
        },
      });
      this.logger.log('GeminiService ready (model: gemini-2.5-flash)');
    } catch (err) {
      this.logger.error(`Failed to initialise Gemini client: ${(err as Error).message}`);
    }
  }

  // Returns generated text, or null when AI is unavailable / fails so the
  // caller can fall back to the template generator.
  async generateTreatmentPlan(input: GeneratePlanInput): Promise<string | null> {
    if (!this.model) return null;
    const start = Date.now();
    try {
      const prompt = this.buildTreatmentPlanPrompt(input);
      const result = await withTimeout(this.model.generateContent(prompt), TIMEOUT_MS);
      const text = result.response.text().trim();
      if (!text) throw new Error('Empty response from Gemini');
      this.logger.log(`Treatment plan generated successfully (${Date.now() - start}ms)`);
      return text;
    } catch (err) {
      this.logger.error(`Treatment plan generation failed (${Date.now() - start}ms): ${(err as Error).message}`);
      return null;
    }
  }

  async generateRecommendation(input: GenerateRecommendationInput): Promise<string | null> {
    if (!this.model) return null;
    const start = Date.now();
    try {
      const prompt = this.buildRecommendationPrompt(input);
      const result = await withTimeout(this.model.generateContent(prompt), TIMEOUT_MS);
      const text = result.response.text().trim();
      if (!text) throw new Error('Empty response from Gemini');
      this.logger.log(`Recommendation generated successfully (${Date.now() - start}ms)`);
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
      '6. Shkruhet si tekst i vazhdueshëm (pa pika liste ose numërime)',
      '7. Nuk shpik simptoma, diagnoza ose detaje klinike që nuk janë dhënë',
      '8. Fillon direkt me planin — pa hyrje si "Sigurisht", "Natyrisht", "Mirë", etj.',
      '9. Nuk përfshin disclaimer-a ose shënime mbi rolin e AI',
      '',
      'Shkruaje direkt planin:',
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
      '7. Shkruhen si paragraf i vazhdueshëm profesional, jo si listë',
      '8. Nuk përfshijnë disclaimer-a mbi rolin e AI',
      '',
      'Shkruaje direkt rekomandimin:',
    );

    return lines.join('\n');
  }
}
