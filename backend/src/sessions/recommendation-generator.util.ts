// Rule-based session recommendation generator for Albanian physiotherapy clinic.
// No external AI — scans the session note for clinical keywords (Albanian) and
// assembles a professional recommendation from matched advice fragments, plus
// treatment-type-specific post-session guidance. Multiple variants per rule
// prevent identical text across sessions; seeded picking keeps output stable
// for identical inputs.

interface KeywordRule {
  pattern: RegExp;
  adviceVariants: string[];
}

// Deterministic variant selection from a string seed + offset
function pickVariant<T>(arr: T[], seed: string, offset = 0): T {
  let h = offset * 2654435761;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return arr[Math.abs(h) % arr.length];
}

// ─── Keyword rules (scan note text, pick advice) ──────────────────────────────

const KEYWORD_RULES: KeywordRule[] = [
  {
    pattern: /dhimbj[ëea]|dhembj[ëea]/i,
    adviceVariants: [
      'Shmangni lëvizjet dhe pozicionet që intensifikojnë dhimbjen; aplikoni nxehtësi të butë nëse dhimbja është joakute dhe jo e shoqëruar me fryrje.',
      'Vazhdoni me ushtrime të lehta fleksibiliteti — ndërprisni menjëherë nëse dhimbja kalon nivelin 4/10.',
      'Aplikoni kompresë të ngrohtë 15-20 minuta, 2-3 herë/ditë, dhe shmangni ngarkesat e tepërta deri në seancën tjetër.',
      'Respektoni "kufirin e dhimbjes" gjatë aktiviteteve: aktivitete të lehta janë të lejuara, por shmangni çdo lëvizje që provokon dhimbje të mprehtë.',
    ],
  },
  {
    pattern: /fryj[ëea]|enjtj[ëea]|inflamacion|edem[ëa]|tumor.*zonat|skuq/i,
    adviceVariants: [
      'Aplikoni akull (të mbështjellë në peshqir) 15-20 minuta çdo 2-3 orë gjatë 24-48 orëve të ardhshme dhe mbani zonën të ngritur kur është e mundur.',
      'Shmangni nxehtësinë lokale dhe masazhin intensiv derisa fryerja të ulet; krioterapi sipas protokollit: 15 min akull, 45 min pushim.',
      'Mbani gjymtyrën e ndikuar të ngritur (mbi nivelin e zemrës nëse është e mundur) dhe shmangni aktivitetet që rrisin qarkullimin lokal.',
    ],
  },
  {
    pattern: /lëvizje? e kufizuar|kufizim.*lëvizje|lëvizshmëri.*ul|ngurtësi|rigjid|bllokuar|rangu.*lëvizjes/i,
    adviceVariants: [
      'Kryeni ushtrimet e mobilitetit 2 herë/ditë (5-10 minuta/herë), mundësisht pas ngrohjes me dush të ngrohtë.',
      'Rekomandohen ushtrime të lehta stretching aktiv 3-4 herë/ditë: mbani çdo pozicion 20-30 sekonda pa forcë dhe pa dhimbje.',
      'Praktikoni lëvizje aktive brenda kufirit pa dhimbje — qëllimi është mirëmbajtja e gamës së arritur, jo shtimi i dhimbjeve.',
    ],
  },
  {
    pattern: /dobësi|forcë e ulët|muskul.*dobë|atrofi|hypotoni|weaknes/i,
    adviceVariants: [
      'Vazhdoni programin e forcimit progresiv 3 herë/javë, me pushim 48 orë ndërmjet seancave të forcimit.',
      'Kryeni kontratat muskulare izometrike 2 herë/ditë (10 repeticion × 3 seri) dhe shtoni ngarkesën gradualisht çdo javë.',
      'Fokusohuni në saktësinë e ekzekutimit të ushtrimeve — kontrol muskulor i mirë ka prioritet ndaj numrit të repeticioneve.',
    ],
  },
  {
    pattern: /lëndim|traumë|aksident|kontuzion|distorsion|çarje|ruptur|avulsion/i,
    adviceVariants: [
      'Shmangni aktivitetet me ngarkesë të lartë dhe sportin deri në vlerësimin e radhës; paraqituni menjëherë nëse shfaqen shenja progresioni të inflamacionit.',
      'Zbatoni protokollin PRICE (Protect, Rest, Ice, Compress, Elevate) — evitoni ngarkimin e zonës së lëndimit deri në konfirmim klinik.',
      'Evitoni çdo aktivitet që shkakton instabilitet ose shtojnë ndjenjën e "lëshimit" derisa zona të stabilizohet plotësisht.',
    ],
  },
  {
    pattern: /ecje|gait|baraspesh|ekuilibr|koordinim|propriocep|paltolje|instabilit/i,
    adviceVariants: [
      'Praktikoni ushtrimet e ekuilibrit mbi sipërfaqe të qëndrueshme fillimisht (pranë murit), duke kaluar gradualisht tek sipërfaqet më sfiduese.',
      'Ushtrimet e ekuilibrit kryejini 2 herë/ditë (10 minuta) me vëmendje të plotë — shmangni shpërdorimin për të parandaluar rëniet.',
      'Fokusohuni në cilësinë e hapave dhe modelit të ecjes: ngadalësoni ritmin dhe rregulloni pozicionin e trupit sipas udhëzimeve të marra.',
    ],
  },
  {
    pattern: /mpirje|ngjirje|tingling|parestezi|ndjesi.*elektrike|djegë|nervore|radikul/i,
    adviceVariants: [
      'Shmangni pozicionet dhe lëvizjet që intensifikojnë mpirjen ose paresthesitë; njoftoni fizioterapeutin nëse simptomat radikulate rriten.',
      'Kujdesuni ndaj pozicionimit: shmangni shtypin e zgjatur mbi zona të ndijme (kryqëzimi i këmbëve, vendosja e krahut poshtë trupit gjatë gjumit).',
      'Kryeni lëvizjet neurodynamike të dhëna me kujdes dhe butësi — ndërprisni nëse mpirja ose dhimbja intensifikohen gjatë ekzekutimit.',
    ],
  },
  {
    pattern: /tension|stres muskulor|spazëm|tension muskulor|kontraktur/i,
    adviceVariants: [
      'Aplikoni termoterapi (banjë të ngrohtë ose kompresë e ngrohtë 20 min) para ushtrimeve të relaksimit muskulor të dhëna.',
      'Teknikat e frymëmarrjes diafragmatike dhe relaksimit progresiv muskulor praktikojini 2 herë/ditë për uljen e tensionit kronik.',
      'Shmangni pozicionet statike të zgjatura (sëdur ose qëndrim në këmbë >45 min) pa pauzë lëvizjeje.',
    ],
  },
  {
    pattern: /koka|migrenë|kokëdhimbje|vertigo|marrje.*mend|çrregullim vestibular/i,
    adviceVariants: [
      'Shmangni ekspozimin ndaj stimujve intensivë (zë, dritë të fortë) dhe pozicionimin e papërshtatshëm që mund të shkaktojë kokëdhimbje cervikogjenike.',
      'Rregulloni ergonomikën e punës: monitori në nivelin e syve, shmangni pozicionin "kokë përpara" dhe bëni pauzë çdo 45-60 minuta.',
      'Mbani shënim frekuencën dhe intensitetin e episodeve të kokëdhimbjes — këto informacione do t\'i ndihmojnë fizioterapeutit të optimizojë trajtimin.',
    ],
  },
  {
    pattern: /post.?op|pas operacion|pas ndërhyrje|kirurgjik|implant|protezë|sutur/i,
    adviceVariants: [
      'Respektoni rreptësisht protokollin pas-operativ — mos shtoni ngarkesë pa autorizim klinik dhe monitoroni shenjat e infeksionit (nxehtësi, skuqje, sekret).',
      'Kujdesuni ndaj plagës kirurgjikale sipas udhëzimeve; njoftoni menjëherë kirurgun ose klinikën nëse vëreni ndryshime lokale shqetësuese.',
      'Shmangni çdo aktivitet që mund të kompromisë stabilitetin e ndërhyrjes kirurgjikale — konfirmoni çdo shtim aktiviteti paraprakisht me ekipin mjekësor.',
    ],
  },
  {
    pattern: /shpin[ëa]|lumbar|disk|hernie|vertebr|lombar|spondilit/i,
    adviceVariants: [
      'Shmangni ngritjen e objekteve të rënda (>5 kg) dhe lëvizjet e kombinuara fleksion-rotacion të shtyllës kurrizore.',
      'Aplikoni "mekanikën e mirë të trupit": gjynjëzimet gjatë ngritjes, shmangni lëvizjet e papritura dhe mbani shpinën në pozicion neutral.',
      'Pozicionimi gjatë gjumit: pozicioni lateral me jastëk ndërmjet gjunjëve ose supinacion me jastëk nën gjunjë — provoni dhe raportoni cilin preferoni.',
    ],
  },
  {
    pattern: /qafë|cervical|qafore/i,
    adviceVariants: [
      'Rregulloni ergonomikën e punës: monitori në nivelin e syve, klaviaturia pranë trupit, shpatullat të relaksuara — bëni pauzë lëvizjeje çdo 45 minuta.',
      'Shmangni pozicionin "kokë përpara" (forward head posture), gjumit me jastëk shumë të lartë dhe ekspozimit ndaj rrymave të ajrit të ftohtë.',
      'Ngrohni butë muskulaturën e qafës para aktivitetit dhe aplikoni termoterapi lokale (10-15 min) nëse ndieni tension të shtuar.',
    ],
  },
  {
    pattern: /sup[ëea]j?|supi|shpatull|supe/i,
    adviceVariants: [
      'Shmangni lëvizjet overhead (mbi kokë), ngritjen e objekteve të rënda nga distanca dhe gjumin mbi supin e dhimbshëm.',
      'Mbani pozicionimin e saktë skapular gjatë aktiviteteve — shmangni lëshimin e shpatullave përpara dhe mbajtjen e tensionit të panevojshëm.',
      'Kryeni ushtrimet e stabilizimit skapular të dhëna çdo ditë — forcojnë muskulaturën mbajtëse pa ngarkuar strukturat e inflamuara.',
    ],
  },
  {
    pattern: /gjur[ëi]|gjunit|patell|menisk|ligament.*gju/i,
    adviceVariants: [
      'Shmangni ngritja dhe zbritja e shkallëve të shumta, uljet e thella (squat) dhe aktivitetet me kthim të papritur të gjurit.',
      'Mbajeni gjurin të ngritur kur jeni ulur dhe aplikoni akull 10-15 minuta nëse ndieni rritje dhimbjeje pas aktivitetit.',
      'Ushtrimet e forcimit të kuadricepsit (kryesisht pozicioni terminal extension) kryejini çdo ditë sipas protokollit — janë thelbësorë për rikuperimin.',
    ],
  },
  {
    pattern: /kofsh[ëa]|pelvi[sk]|koksofemoral|ileopsoas/i,
    adviceVariants: [
      'Shmangni lëvizjet e papritura të rotacionit të kofshës dhe aktivitetet me ngarkesë unilaterale të zgjatur.',
      'Ushtrimet e forcimit të abduktorëve dhe muskulaturës pelvikofemurale kryejini çdo ditë — janë thelbësorë për stabilitetin gjatë ecjes.',
      'Rregulloni lartësinë e ulëses (kurrë shumë e ulët) dhe shmangni kryqëzimin e gjatë të këmbëve në pozicion sedentare.',
    ],
  },
];

// ─── Treatment-type-specific post-session advice ──────────────────────────────

interface TreatmentTypeAdvice {
  pattern: RegExp;
  advice: string;
}

const TREATMENT_TYPE_ADVICE: TreatmentTypeAdvice[] = [
  {
    pattern: /terapi manuale|manual therapy|mobilizim|manipulim/i,
    advice: 'Pas terapisë manuale, zona mund të ndjehet pak e ndjeshme për 24-48 orë — kjo është reagim normal i indeve dhe kalon spontanisht.',
  },
  {
    pattern: /ushtrime terapeutike|rehabilitim aktiv|strengthening|forcim/i,
    advice: 'Dhimbja muskulore e vonuar (DOMS) pas ushtrimeve terapeutike është normale — aplikoni stretching të butë dhe hidratohuni mjaftueshëm.',
  },
  {
    pattern: /elektroterapi|tens|interferencial|galvani[kc]|elektrostimulim/i,
    advice: 'Zona e trajtuar me elektroterapi mund të ketë ndjesi të lehtë ngrohjeje ose formikeze — normale dhe kalimtare. Shmangni nxehtësinë shtëpiake lokale për 2-4 orë.',
  },
  {
    pattern: /ultrazë|ultrasonografi terapeutike|ultrasound/i,
    advice: 'Pas trajtimit me ultrazë terapeutike, shmangni aplikimin e nxehtësisë ose ftohjës lokale intensive për 2 orë.',
  },
  {
    pattern: /laser|terapi me lazer/i,
    advice: 'Pas terapisë me lazer, shmangni ekspozimin e zonës ndaj dritës diellore direkte për 24 orë dhe aplikojeni kremin mbrojtës nëse zona është e ekspozuar.',
  },
  {
    pattern: /masazh terapeutik|masazh|massage/i,
    advice: 'Hidratohuni mirë pas masazhit terapeutik — qarkullimi i rritur nxit eliminimin e metaboliteve. Zona mund të ndjehesë e lodhur për 12-24 orë.',
  },
  {
    pattern: /termoterapi|nxehtësi|hotpack|paraffin/i,
    advice: 'Pas termoterapisë klinike, shmangni riekspozimin e zgjatur ndaj nxehtësisë lokale shtëpiake — kufizoni në maximum 10-15 minuta nëse nevojitet.',
  },
  {
    pattern: /krioterapi|krio|akull|të ftohtë|icing/i,
    advice: 'Pas krioterapisë, zona do të ndjejë ngrohje reaktive — kjo është normale. Shmangni riekspozimin ndaj të ftohtit intensiv menjëherë pas seancës.',
  },
  {
    pattern: /stretching|shtrirje|fleksibilitet/i,
    advice: 'Pas stretching terapeutik, muskujt mund të ndjehen të relaksuar dhe pak të lodhur — hidratohuni dhe shmangni kontratat intensive muskulare për 1-2 orë.',
  },
  {
    pattern: /tape|kinesio|taping|bandazh/i,
    advice: 'Tape-i aplikuar mund të qëndrojë 3-5 ditë — largojeni nëse ndjeni kruarje, skuqje apo shqetësim të lëkurës. Shmangni lagjen e tepruar të zonës.',
  },
];

// ─── Generic fallback advice (when no keywords match) ─────────────────────────

const GENERIC_ADVICE_VARIANTS = [
  'Vazhdoni me rutinën e ushtrimeve të dhëna dhe respektoni udhëzimet posturale gjatë aktiviteteve të zakonshme.',
  'Kryeni programin e ushtrimeve shtëpiake me rregullsi dhe shmangni aktivitetet që shkaktojnë shtim simptomash.',
  'Respektoni të gjitha rekomandimet e marra dhe angazhohuni aktivisht me programin e ushtrimeve ndërseancore.',
  'Vazhdoni me protokollin e aktiviteteve të dhënë dhe monitoroni simptomat — njoftoni fizioterapeutin për çdo ndryshim të rëndësishëm.',
];

// ─── Closing sentences ────────────────────────────────────────────────────────

const CLOSING_VARIANTS = [
  'Respektoni orarin e seancave të planifikuara dhe njoftoni klinikën paraprakisht nëse nuk mund të paraqiteni.',
  'Nëse simptomat përkeqësohen ndjeshëm ose shfaqen simptoma të reja e shqetësuese, kontaktoni klinikën para seancës tjetër.',
  'Angazhimi konsistent me programin e ushtrimeve shtëpiake dhe respektimi i rekomandimeve posturale janë thelbësorë për rikuperimin optimal.',
  'Seancat e ardhshme do të rregullohen sipas progresit tuaj — raportoni ecurinë e simptomave për t\'i optimizuar trajtimin.',
];

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateSessionRecommendation(notes?: string | null, treatmentTypes?: string[] | null): string {
  const noteText = (notes ?? '').trim();
  const seed = noteText + (treatmentTypes ?? []).join('|');

  const parts: string[] = [];

  // Treatment-type-specific intro
  const matchedTypeAdvice = (treatmentTypes ?? [])
    .map((t) => TREATMENT_TYPE_ADVICE.find((rule) => rule.pattern.test(t)))
    .filter((r): r is TreatmentTypeAdvice => !!r);

  if (matchedTypeAdvice.length) {
    // Deduplicate if multiple treatment types match the same pattern
    const seen = new Set<string>();
    for (const r of matchedTypeAdvice) {
      if (!seen.has(r.advice)) {
        parts.push(r.advice);
        seen.add(r.advice);
      }
    }
  } else if (treatmentTypes?.length) {
    parts.push(
      pickVariant(
        [
          `Pas seancës me ${treatmentTypes.join(', ')}, pacienti duhet të ndjekë me kujdes rekomandimet e mëposhtme.`,
          `Trajtimi i kryer me ${treatmentTypes.join(', ')} kërkon respektimin e udhëzimeve pas-sesancore të mëposhtme.`,
        ],
        seed,
        10,
      ),
    );
  }

  // Keyword-matched advice from note text
  const matched = KEYWORD_RULES.filter((rule) => rule.pattern.test(noteText));
  if (matched.length) {
    for (let i = 0; i < matched.length; i++) {
      parts.push(pickVariant(matched[i].adviceVariants, seed, i + 20));
    }
  } else if (noteText) {
    parts.push(pickVariant(GENERIC_ADVICE_VARIANTS, seed, 50));
  } else {
    parts.push(GENERIC_ADVICE_VARIANTS[0]);
  }

  // Closing
  parts.push(pickVariant(CLOSING_VARIANTS, seed, 99));

  return parts.join(' ');
}
