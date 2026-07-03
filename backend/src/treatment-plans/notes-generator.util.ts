// Template-based treatment-plan narrative generator for Albanian physiotherapy
// clinic. No external AI service — uses body-region detection + seeded variant
// selection so the same diagnosis produces the same text (deterministic) but
// different patients/diagnoses produce meaningfully different text.
//
// Seed-based picking: uses a fast string hash so results are stable for a given
// set of inputs but vary across patients without needing a random call.

type BodyRegion =
  | 'lumbar'
  | 'cervical'
  | 'shoulder'
  | 'knee'
  | 'hip'
  | 'neurological'
  | 'post_surgical'
  | 'degenerative'
  | 'general';

function detectRegion(diagnosis: string, complaints: string[]): BodyRegion {
  const text = [diagnosis, ...complaints].join(' ').toLowerCase();
  if (/post.?op|pas operacion|pas ndërhyrje|kirurgjik|implant|protez/i.test(text)) return 'post_surgical';
  if (/neuropati|nevralgjia?|radikulopati|mpirje|ngjirje|sciatic|nerv.*shtyp|kompresion.*nerv|radikul/i.test(text)) return 'neurological';
  if (/spondiloz|artroz|artrit reumatoid|osteoartrit|osteoportoz|degjenerativ|osteofito/i.test(text)) return 'degenerative';
  if (/qafë|cervical|shtyllë.*qaf|c[1-7][^a-z]|kolo?n.*cervikal|cervikobrachial/i.test(text)) return 'cervical';
  if (/shpin[ëa]|lumbar|l[1-5][^a-z]|s1[^0-9]|lombar|hernie.*disk|disk herniation|hernie.*nukleus|spondilit|kolona lumbale/i.test(text)) return 'lumbar';
  if (/sup[ëea]j?|supi|rotator cuff|brachial|humerus|akromion|tendinit sup|burs[ëa]|tendinopati sup/i.test(text)) return 'shoulder';
  if (/gjur[ëi]|gjunit|menisk|patell|acl|lcl|mcl|pcl|femorotibi|kondromalaci|ligament.*gjur|tendon.*patell/i.test(text)) return 'knee';
  if (/kofsh[ëa]|koksofemoral|pelvi[sk]|ileopsoas|trokanteri|acetabul|sinovit.*hip|femur proksimal/i.test(text)) return 'hip';
  return 'general';
}

// Deterministic hash for variant picking — same seed → same variant, but
// different seeds land at different positions in each array.
function pickVariant<T>(arr: T[], seed: string, offset = 0): T {
  let h = offset * 2654435761;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return arr[Math.abs(h) % arr.length];
}

// ─── Opening focus by region ────────────────────────────────────────────────

const FOCUS_BY_REGION: Record<BodyRegion, string[]> = {
  lumbar: [
    'reduktimin e dhimbjeve lumbale, stabilizimin e shtyllës kurrizore dhe rikthimin e kapacitetit funksional të pacientit',
    'menaxhimin e sindromes lumbale nëpërmjet relaksimit muskulor, stabilizimit aktiv dhe normalizimit të lëvizjeve të shpinës',
    'kontrollin e dhimbjeve në rajonin lumbar, forcimin e muskulaturës paravertebrale mbajtëse dhe riintegrimin funksional gradual',
  ],
  cervical: [
    'lehtësimin e dhimbjeve cervikale, rikthimin e gamës normale të lëvizjes së qafës dhe relaksimin e muskulaturës rajonale',
    'trajtimin e patologjisë cervikale me fokus në mobilitetin artikular, relaksimin postural dhe forcimin e muskulaturës mbajtëse të qafës',
    'reduktimin e tensionit muskulor cervikalë, normalizimin e gamës së lëvizjes dhe uljen e dhimbjeve të qafës dhe krahërorit sipëror',
  ],
  shoulder: [
    'rikuperimin e funksionit të supit, uljen e dhimbjeve dhe rikthimin gradual të gamës normale të lëvizjes',
    'rehabilitimin supalar me fokus në stabilizimin skapular, forcimin e rotator cuff dhe eleminimin e dhimbjeve',
    'trajtimin e patologjisë supale duke synuar normalizimin e funksionit, rritjen e lëvizjes dhe rikuperimin e forcës muskulore',
  ],
  knee: [
    'rehabilitimin e gjurit, kontrollin e dhimbjeve dhe rikthimin e stabilitetit funksional',
    'rivendosjen e funksionit të gjurit nëpërmjet forcimit të kuadricepsit, ekuilibrit neuromuskulor dhe menaxhimit të dhimbjeve',
    'trajtimin e patologjisë së gjurit me synimin e rikuperimit të stabilitetit, kapacitetit funksional dhe eliminimit të dhimbjeve',
  ],
  hip: [
    'rehabilitimin e rajonit koksofemoral, normalizimin e funksionit motorik dhe uljen e dhimbjeve',
    'trajtimin e patologjisë së kofshës me fokus në gamën e lëvizjes artikulare, forcimin muskulor dhe normalizimin e modelit të ecjes',
    'rikuperimin e funksionit të kofshës dhe pelvisit nëpërmjet eliminimit të dhimbjeve dhe rikthimit të lëvizjes funksionale',
  ],
  neurological: [
    'menaxhimin e simptomave neurologjike, uljen e dhimbjeve radikulate dhe riaktivizimin gradual të funksionit neuromuskulor',
    'trajtimin e patologjisë me komponente neurologjike duke synuar uljen e simptomave nervore dhe forcimin e muskulaturës së prekur',
    'rehabilitimin neuromuskulor me fokus në kontrollin e dhimbjeve nëpërmjet teknikave neurodynamike dhe riintegrimit funksional progresiv',
  ],
  post_surgical: [
    'rikuperimin pas-operativ nëpërmjet programit të strukturuar rehabilitimi me faza progresive dhe monitorim klinik të kujdesshëm',
    'rehabilitimit post-kirurgjikalë duke respektuar protokollin pas-operativ, me progresion gradual të ngarkesës dhe monitorim të vazhdueshëm',
    'rikthimit të funksionit pas ndërhyrjes kirurgjikale nëpërmjet menaxhimit të edemës, riaktivizimit muskulor dhe forcimit progresiv',
  ],
  degenerative: [
    'menaxhimit konservator të patologjisë degjenerative, ruajtjes së kapacitetit funksional dhe ngadalësimit të progresionit simptomatik',
    'trajtimit të patologjisë degjenerative me fokus në kontrollin e dhimbjeve, ruajtjen e gamës së lëvizjes dhe forcimin e muskulaturës mbajtëse',
    'optimizimit të cilësisë së jetës dhe kapacitetit funksional në kontekstin e patologjisë degjenerative, nëpërmjet qasjes konservatore',
  ],
  general: [
    'trajtimit të patologjisë identifikuar dhe rikthimit gradual të funksionit normal muskuloskeletar',
    'uljen e simptomave, normalizimin e funksionit dhe rikuperimin e kapacitetit funksional të pacientit',
    'rivendosjen e funksionit muskuloskeletar, eleminimin e dhimbjeve dhe rikthimin e pavarësisë funksionale',
  ],
};

// ─── Opening sentence templates ─────────────────────────────────────────────

const OPENING_TEMPLATES = [
  (diag: string, focus: string) => `Plani terapeutik për ${diag.trim()} synon ${focus}.`,
  (diag: string, focus: string) => `Programi i rehabilitimit i hartuar për ${diag.trim()} ka si objektiv primar ${focus}.`,
  (diag: string, focus: string) => `Kursi i trajtimit fokusohet në menaxhimin e ${diag.trim()}, me synimin e ${focus}.`,
  (diag: string, focus: string) => `Protokolli i fizioterapisë për ${diag.trim()} përqendrohet në ${focus}.`,
];

// ─── Complaint introduction phrases ─────────────────────────────────────────

const COMPLAINT_INTROS = [
  'Pacienti paraqet si simptoma kryesore',
  'Vlerësimi klinik identifikon si ankesa fillestare',
  'Tabloja klinike karakterizohet nga',
  'Anamneza dhe ekzaminimi klinik evidentojnë si ankesa themelore',
  'Pacienti raporton si simptoma prioritare',
];

// ─── Diagnosis consideration phrases ─────────────────────────────────────────

const DIAGNOSIS_INTROS = [
  'Vlerësimi klinik orienton konsideratat diagnostikuese drejt',
  'Gjetjet klinike mbështesin si diagnoza relevante',
  'Tabloja simptomatike dhe ekzaminimi fizik orientojnë drejt',
  'Konsideratat diagnostikuese të mbështetura nga vlerësimi klinik përfshijnë',
  'Bazuar në anamnezën dhe ekzaminimin, konfirmohen si diagnoza',
];

// ─── Session count phrases ────────────────────────────────────────────────────

const SESSION_PHRASES = [
  (n: number) => `Kursi i trajtimit parashikon gjithsej ${n} seanca, me progresion gradual bazuar në rikuperimin klinik dhe tolerancën e pacientit.`,
  (n: number) => `Programi do të zhvillohet në ${n} seanca terapeutike, me intensitet dhe fokus të rregulluara vazhdimisht sipas ecurisë klinike.`,
  (n: number) => `Plani terapeutik strukturohet në ${n} seanca, të organizuara në faza progresive sipas objektivave klinike dhe reagimit individual.`,
  (n: number) => `Trajtimi do të kryhet nëpërmjet ${n} seancave, me vlerësim periodik dhe adaptim të protokollit sipas progresit funksional.`,
];

// ─── Method application phrases ──────────────────────────────────────────────

const METHOD_PHRASES = [
  (methods: string) => `Seancat do të mbështeten kryesisht në ${methods}, me rregullim të vazhdueshëm të intensitetit bazuar në tolerancën dhe reagimin klinik të pacientit.`,
  (methods: string) => `Protokolli terapeutik do të aplikojë ${methods} si teknika kryesore, me kombinim dhe progresion sipas nevojave specifike të pacientit.`,
  (methods: string) => `Trajtimi do të integrojë ${methods}, të aplikuara në mënyrë progresive dhe të koordinuara sipas fazës dhe objektivave të rikuperimit.`,
  (methods: string) => `Teknikat e zgjedhura — ${methods} — do të aplikohen me intensitet progresiv dhe rregullim konstant bazuar në feedback-un klinik.`,
];

// ─── Progression descriptions by region ──────────────────────────────────────

const PROGRESSIONS: Record<BodyRegion, string[]> = {
  lumbar: [
    'Trajtimi zhvillohet në tre faza: faza fillestare synon kontrollin e dhimbjeve dhe relaksimin e muskulaturës paravertebrale; faza e mesme introduce ushtrimet e stabilizimit lumbar dhe forcimin e bërthamës (core); faza finale fokusohet në kthimin e kapacitetit funksional dhe parandalimin e recidivave.',
    'Protokolli progreson nga teknikat pasive për kontrollin e dhimbjeve drejt programit aktiv të stabilizimit të shtyllës kurrizore, duke kaluar gradualisht nga ushtrimet bazë tek ato funksionale dhe edukimi postural afatgjatë.',
  ],
  cervical: [
    'Faza fillestare fokusohet në relaksimin e muskulaturës cervikale dhe mobilizimin e kontrolluar; faza e mesme introduce forcimin izometrik dhe ushtrimet proprioceptive; faza finale synon edukimin postural dhe parandalimin e recidivave.',
    'Trajtimi kalon nga relaksimi aktiv dhe mobilizimi i butë cervikalë, drejt forcimit progresiv të muskulaturës mbajtëse dhe programit të ergonomisë posturale, me adaptim të vazhdueshëm sipas simptomave.',
  ],
  shoulder: [
    'Rehabilitimi strukturohet në tri faza: kontrolli i dhimbjeve dhe mobilizimi pasiv; forcimi aktiv i rotator cuff dhe stabilizuesve skapulare; integrimi funksional i supit në aktivitetet e zakonshme dhe parandalimi i recidivave.',
    'Protokolli progreson nga mobilizimi i kontrolluar dhe kontrolli i inflamacionit drejt forcimit progresiv dhe stabilizimit neuromuskulor, me integrimin final të funksionit funksional të supit.',
  ],
  knee: [
    'Programi fillon me kontrollin e inflamacionit dhe edemës dhe forcimin izometrik; progreson drejt forcimit progresiv të kuadricepsit dhe hamstring; faza finale fokusohet në proprioceptivitetin, stabilitetin dinamik dhe kthimin te aktivitetet e zakonshme.',
    'Rehabilitimi i gjurit zhvillohet nga kontrolli i ngarkesës dhe forcimi fillestar izometrik, drejt ushtrimeve me ngarkesë progresive dhe integrimit funksional të plotë, me vëmendje të veçantë ndaj ekuilibrit neuromuskulor.',
  ],
  hip: [
    'Trajtimi kalon nga mobilizimi i butë koksofemoral dhe kontrolli i dhimbjeve, drejt forcimit progresiv të muskulaturës pelvikofemurale dhe normalizimit gradual të modelit të ecjes dhe funksionit të plotë.',
    'Faza fillestare synon menaxhimin e dhimbjeve dhe mobilizimin artikular; faza e mesme introduce forcimin, koordinimin dhe stabilizimin; faza finale fokusohet në kthimin e funksionit të plotë dhe aktiviteteve të zakonshme.',
  ],
  neurological: [
    'Trajtimi fillon me teknikat neurodynamike dhe menaxhimin e dhimbjeve radikulate; progreson drejt riaktivizimit neuromuskulor progresiv dhe forcimit të muskulaturës e prekur, me integrimin final të funksionit motorik.',
    'Protokolli zhvillohet nga reduktimi i kompresionit neural dhe simptomave, drejt forcimit aktiv të muskulaturës e weakened, me kalim gradual drejt rikuperimit funksional dhe integrimit në aktivitetet e zakonshme.',
  ],
  post_surgical: [
    'Faza pas-operative e hershme fokusohet në menaxhimin e edemës, analgezisë dhe mobilizimit të hershëm të kontrolluar; faza e mesme introduce riaktivizimin muskulor aktiv dhe forcimin progresiv; faza finale synon rikthimin e funksionit të plotë dhe kthimin tek aktivitetet e zakonshme.',
    'Rehabilitimi pas-operativ respekton protokollin e fazave: kontrolli i edemës dhe lëvizja pasive e hershme, riaktivizimi muskulor aktiv dhe forcimi gradual, funksioni i plotë dhe reintegrimi në aktivitetin normal.',
  ],
  degenerative: [
    'Programi kombinon terapi manualen për kontrollin e dhimbjeve, ushtrime adaptive për ruajtjen dhe zgjerimin e gamës së lëvizjes, forcimin e muskulaturës mbajtëse dhe edukimin e pacientit për menaxhimin afatgjatë të patologjisë kronike.',
    'Trajtimi synon rritjen progresive të kapacitetit funksional duke balancuar ngarkesën terapeutike me tolerancën individuale: teknikat pasive reduktojnë dhimbjen, ushtrimet aktive mirëmbajnë funksionin, edukimi ndihmon menaxhimin afatgjatë.',
  ],
  general: [
    'Trajtimi progreson nga faza pasive e kontrollit të simptomave, drejt fazës aktive të rikuperimit funksional, me kalim gradual drejt forcimit dhe parandalimit të recidivave sipas reagimit individual të pacientit.',
    'Protokolli zhvillohet me tre faza progresive: menaxhimi i simptomave akute, rikuperimi aktiv i funksionit dhe forcimit, dhe reintegrimi funksional me fokus në parandalimin e recidivave.',
  ],
};

// ─── Closing sentences ────────────────────────────────────────────────────────

const CLOSINGS = [
  'Pacienti udhëzohet të respektojë programin e ushtrimeve shtëpiake dhe të informojë fizioterapeutin menjëherë nëse simptomat intensifikohen ose shfaqen simptoma të reja.',
  'Bashkëpunimi aktiv i pacientit dhe respektimi i udhëzimeve ndërseancore janë thelbësorë për arritjen e objektivave terapeutike të planifikuara.',
  'Pacienti këshillohet të evitojë aktivitetet që përkeqësohen simptomat, të kryejë programin e ushtrimeve me rregullsi dhe të paraqitet në të gjitha seancat e planifikuara.',
  'Edukimi i pacientit mbi ergonomikën, pozicionimin e saktë dhe modifikimin e aktiviteteve do të jetë komponent integral gjatë gjithë kursit të trajtimit.',
  'Suksesi i trajtimit varet nga kombinimi i seancave klinike me angazhimin e pacientit jashtë klinikës — pacienti inkurajohet të ndjekë të gjitha rekomandimet me konsistencë.',
];

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateTreatmentPlanNotes(
  diagnosis: string,
  treatmentTypes: string[],
  totalSessions?: number,
  existingNotes?: string,
  complaints?: string[],
  selectedDiagnoses?: string[],
): string {
  const seed = [diagnosis, ...(complaints ?? []), ...(selectedDiagnoses ?? [])].join('|');
  const region = detectRegion(diagnosis, complaints ?? []);

  const focus = pickVariant(FOCUS_BY_REGION[region], seed, 0);
  const openingTpl = pickVariant(OPENING_TEMPLATES, seed, 1);
  const methodsList = treatmentTypes.length ? treatmentTypes.join(', ') : 'teknika të përshtatshme fizioterapie';
  const methodPhraseTpl = pickVariant(METHOD_PHRASES, seed, 2);
  const progressionText = pickVariant(PROGRESSIONS[region], seed, 3);
  const closing = pickVariant(CLOSINGS, seed, 4);

  const parts: string[] = [openingTpl(diagnosis.trim(), focus)];

  if (complaints?.length) {
    const complaintIntro = pickVariant(COMPLAINT_INTROS, seed, 5);
    parts.push(`${complaintIntro}: ${complaints.join(', ')}.`);
  }

  if (selectedDiagnoses?.length) {
    const diagIntro = pickVariant(DIAGNOSIS_INTROS, seed, 6);
    parts.push(`${diagIntro}: ${selectedDiagnoses.join(', ')}.`);
  }

  if (totalSessions && totalSessions > 0) {
    const sessionPhraseTpl = pickVariant(SESSION_PHRASES, seed, 7);
    parts.push(sessionPhraseTpl(totalSessions));
  }

  parts.push(methodPhraseTpl(methodsList));
  parts.push(progressionText);

  if (existingNotes?.trim()) {
    parts.push(
      `Duke integruar shënimet ekzistuese (${existingNotes.trim()}), protokolli përshtatet sipas nevojave dhe veçorive specifike të pacientit.`,
    );
  }

  parts.push(closing);

  return parts.join(' ');
}
