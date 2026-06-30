// Rule-based recommendation drafting — there is no external AI/LLM
// integration in this project, so "generate" here means: read the
// physiotherapist's short note for clinically meaningful keywords (pain,
// swelling, mobility, etc.) and assemble a professional Albanian
// recommendation template from matched advice fragments + whichever
// treatment types were administered. It's a draft the physiotherapist is
// expected to review/edit, never sent anywhere automatically.
interface KeywordRule {
  keywords: string[];
  advice: string;
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    keywords: ['dhimbje', 'dhembje', 'dhimbjen', 'dhimbjes'],
    advice: 'Vazhdoni me ushtrime të lehta për fleksibilitet dhe shmangni lëvizjet që rrisin dhimbjen.',
  },
  {
    keywords: ['fryrje', 'enjtje', 'inflamacion'],
    advice: 'Aplikoni akull lokal 15-20 minuta disa herë në ditë dhe mbani zonën të ngritur kur është e mundur.',
  },
  {
    keywords: ['lëvizshmëri', 'levizshmeri', 'lëvizje e kufizuar', 'rigjid', 'ngurtësi'],
    advice: 'Rekomandohen ushtrime ditore për rritjen e gamës së lëvizjes, të kryera gradualisht dhe pa forcim.',
  },
  {
    keywords: ['dobësi', 'dobesi', 'muskul', 'forcë'],
    advice: 'Vazhdoni me program të forcimit progresiv të muskulaturës së prekur, 2-3 herë në javë.',
  },
  {
    keywords: ['lëndim', 'lendim', 'traumë', 'trauma'],
    advice: 'Shmangni aktivitete me ngarkesë të lartë derisa zona të stabilizohet plotësisht.',
  },
  {
    keywords: ['ecje', 'ekuilibër', 'ekuiliber', 'baraspeshë'],
    advice: 'Praktikoni ushtrime ekuilibri në mjedis të sigurt, mundësisht me mbikëqyrje fillimisht.',
  },
];

const GENERIC_ADVICE = 'Respektoni planin e seancave të rekomanduara dhe njoftoni fizioterapeutin nëse simptomat përkeqësohen.';

export function generateSessionRecommendation(notes?: string | null, treatmentTypes?: string[] | null): string {
  const text = (notes || '').toLowerCase();
  const matched = KEYWORD_RULES.filter((rule) => rule.keywords.some((k) => text.includes(k)));

  const parts: string[] = [];
  if (treatmentTypes?.length) {
    parts.push(`Pas seancës me ${treatmentTypes.join(', ')}, pacienti duhet të vazhdojë me kujdesin e zakonshëm pas-trajtimit.`);
  }
  if (matched.length) {
    parts.push(...matched.map((m) => m.advice));
  } else {
    parts.push('Vazhdoni me rutinën e ushtrimeve të caktuara dhe respektoni udhëzimet e fizioterapeutit.');
  }
  parts.push(GENERIC_ADVICE);

  return parts.join(' ');
}
