import { PrismaClient, Role, Gender, PaymentStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Duke nisur sedin e databazës...');

  // ==========================================
  // DEGËT
  // ==========================================
  const branchPrishtina = await prisma.branch.upsert({
    where: { name: 'Prishtina' },
    update: {},
    create: {
      name: 'Prishtina',
      city: 'Prishtinë',
      address: 'Rr. Nënë Tereza, Nr. 12, Prishtinë',
      phone: '+383 44 123 456',
      email: 'prishtina@xhelalshatri.com',
    },
  });

  const branchPeja = await prisma.branch.upsert({
    where: { name: 'Peja' },
    update: {},
    create: {
      name: 'Peja',
      city: 'Pejë',
      address: 'Rr. Mbretëresha Teutë, Nr. 5, Pejë',
      phone: '+383 44 234 567',
      email: 'peja@xhelalshatri.com',
    },
  });

  const branchIstog = await prisma.branch.upsert({
    where: { name: 'Istog' },
    update: {},
    create: {
      name: 'Istog',
      city: 'Istog',
      address: 'Rr. Kelmendi, Nr. 3, Istog',
      phone: '+383 44 345 678',
      email: 'istog@xhelalshatri.com',
    },
  });

  console.log('✅ Degët u krijuan');

  const salt = await bcrypt.genSalt(10);

  // ==========================================
  // PËRDORUESIT — një për secilin rol
  // ==========================================
  const admin = await prisma.user.upsert({
    where: { username: 'xhelalshatri' },
    update: {},
    create: {
      username: 'xhelalshatri',
      passwordHash: await bcrypt.hash('Admin123', salt),
      firstName: 'Xhelal',
      lastName: 'Shatri',
      role: Role.ADMIN,
    },
  });

  const manager = await prisma.user.upsert({
    where: { username: 'dritonberisha' },
    update: {},
    create: {
      username: 'dritonberisha',
      passwordHash: await bcrypt.hash('Menagjer123', salt),
      firstName: 'Driton',
      lastName: 'Berisha',
      role: Role.MANAGER,
    },
  });

  const physio = await prisma.user.upsert({
    where: { username: 'artamorina' },
    update: {},
    create: {
      username: 'artamorina',
      passwordHash: await bcrypt.hash('Fizioterapeut123', salt),
      firstName: 'Arta',
      lastName: 'Morina',
      role: Role.PHYSIOTHERAPIST,
    },
  });

  // Menaxheri menaxhon të tria degët; fizioterapeuti lidhet me të tria degët
  await prisma.branch.update({ where: { id: branchPrishtina.id }, data: { managerId: manager.id } });
  await prisma.branch.update({ where: { id: branchPeja.id }, data: { managerId: manager.id } });
  await prisma.branch.update({ where: { id: branchIstog.id }, data: { managerId: manager.id } });

  await prisma.userBranch.createMany({
    data: [
      { userId: manager.id, branchId: branchPrishtina.id },
      { userId: manager.id, branchId: branchPeja.id },
      { userId: manager.id, branchId: branchIstog.id },
      { userId: physio.id, branchId: branchPrishtina.id },
      { userId: physio.id, branchId: branchPeja.id },
      { userId: physio.id, branchId: branchIstog.id },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Përdoruesit u krijuan dhe u caktuan');

  // ==========================================
  // PACIENTËT
  // ==========================================
  const patient1 = await prisma.patient.upsert({
    where: { id: 'patient-seed-001' },
    update: {},
    create: {
      id: 'patient-seed-001',
      firstName: 'Agron',
      lastName: 'Hasani',
      phone: '+383 44 555 001',
      address: 'Rr. Iliria, Prishtinë',
      birthDate: new Date('1985-03-15'),
      gender: Gender.MALE,
      branchId: branchPrishtina.id,
      notes: 'Dhembje në shpinë, 3 vite',
    },
  });

  const patient2 = await prisma.patient.upsert({
    where: { id: 'patient-seed-002' },
    update: {},
    create: {
      id: 'patient-seed-002',
      firstName: 'Valbona',
      lastName: 'Rama',
      phone: '+383 44 555 002',
      address: 'Rr. Dëshmorët, Pejë',
      birthDate: new Date('1990-07-22'),
      gender: Gender.FEMALE,
      branchId: branchPeja.id,
      notes: 'Dhembje në qafë dhe krah',
    },
  });

  const patient3 = await prisma.patient.upsert({
    where: { id: 'patient-seed-003' },
    update: {},
    create: {
      id: 'patient-seed-003',
      firstName: 'Besnik',
      lastName: 'Aliu',
      phone: '+383 44 555 003',
      address: 'Rr. Kelmendi, Istog',
      birthDate: new Date('1978-11-08'),
      gender: Gender.MALE,
      branchId: branchIstog.id,
      notes: 'Gonartrozë e gjurit të majtë',
    },
  });

  console.log('✅ Pacientët u krijuan');

  // ==========================================
  // PLANET E TRAJTIMIT
  // ==========================================
  const plan1 = await prisma.treatmentPlan.upsert({
    where: { id: 'plan-seed-001' },
    update: {},
    create: {
      id: 'plan-seed-001',
      patientId: patient1.id,
      diagnosis: 'Lumboischialgia',
      totalSessions: 8,
      completedSessions: 3,
      sessionFee: 25,
      totalAmount: 8 * 25,
      amountPaid: 3 * 25,
      paymentStatus: PaymentStatus.PARTIALLY_PAID,
      startDate: new Date('2025-01-10'),
      notes: 'Trajtim me terapia manuale dhe ushtrime',
    },
  });

  const plan2 = await prisma.treatmentPlan.upsert({
    where: { id: 'plan-seed-002' },
    update: {},
    create: {
      id: 'plan-seed-002',
      patientId: patient2.id,
      diagnosis: 'Cervicalgia',
      totalSessions: 6,
      completedSessions: 6,
      sessionFee: 25,
      totalAmount: 6 * 25,
      amountPaid: 6 * 25,
      paymentStatus: PaymentStatus.PAID,
      startDate: new Date('2025-01-05'),
      endDate: new Date('2025-02-05'),
    },
  });

  console.log('✅ Planet e trajtimit u krijuan');

  // ==========================================
  // PAGESAT
  // ==========================================
  await prisma.payment.upsert({
    where: { invoiceNumber: 'INV-2025-0001' },
    update: {},
    create: {
      invoiceNumber: 'INV-2025-0001',
      patientId: patient1.id,
      branchId: branchPrishtina.id,
      treatmentPlanId: plan1.id,
      amount: 75,
      status: PaymentStatus.PARTIALLY_PAID,
      paidAt: new Date('2025-01-10'),
      notes: 'Pagesa e parë — 3 seanca',
    },
  });

  await prisma.payment.upsert({
    where: { invoiceNumber: 'INV-2025-0002' },
    update: {},
    create: {
      invoiceNumber: 'INV-2025-0002',
      patientId: patient2.id,
      branchId: branchPeja.id,
      treatmentPlanId: plan2.id,
      amount: 150,
      status: PaymentStatus.PAID,
      paidAt: new Date('2025-02-05'),
      notes: 'Pagesa e plotë për planin 6 seanca',
    },
  });

  console.log('✅ Pagesat u krijuan');

  // ==========================================
  // GJENDJET E SUGJERUARA (Admin-managed "Gjendjet e sugjeruara")
  // ==========================================
  const CONDITION_NAMES = [
    'Gonarthrosis', 'Meniscus injury', 'Lumboischialgia', 'Disc Herniation',
    'Cervicalgia', 'Muscle strain', 'Tendinitis', 'Sciatica',
  ];
  const conditionsByName = new Map<string, { id: string }>();
  for (const name of CONDITION_NAMES) {
    const condition = await prisma.suggestedCondition.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    conditionsByName.set(name, condition);
  }
  console.log('✅ Gjendjet e sugjeruara u krijuan');

  // ==========================================
  // ANKESAT KRYESORE — anatomical categories with canonical complaint list.
  // New complaints are upserted (name is unique key). Category is always
  // written so re-running the seed keeps it up to date even if an admin
  // cleared it accidentally.  Scalar fields (name, category) are updated;
  // suggested-condition links are managed separately below.
  // ==========================================
  const CANONICAL_COMPLAINTS: { name: string; category: string }[] = [
    { name: 'Dhimbje në qafë që përhapet në krah', category: 'CERVIKALE' },
    { name: 'Marramendje', category: 'CERVIKALE' },
    { name: 'Mpirje dhe dobësi në dorë', category: 'CERVIKALE' },
    { name: 'Dhimbje në pjesën e sipërme të shpinës', category: 'TORAKALE' },
    { name: 'Dhimbje mesi që përhapet në këmbën e djathtë', category: 'LOMBOSAKRALE' },
    { name: 'Dhimbje e krahut të djathtë', category: 'KRAHU' },
    { name: 'Dhimbje në shpatullën e majtë', category: 'KRAHU' },
    { name: 'Dhimbje në pjesën e brendshme të bërrylit', category: 'BERRYLI' },
    { name: 'Dhimbje në pjesën e jashtme të bërrylit', category: 'BERRYLI' },
    { name: 'Dhimbje në kyçin e dorës me mpirje të gishtave', category: 'KYCI' },
    { name: 'Dhimbje në kyçin e këmbës', category: 'KYCI' },
    { name: 'Dhimbje në ijë gjatë ecjes', category: 'KERDHOKULLA' },
    { name: 'Dhimbje në vithe', category: 'KERDHOKULLA' },
    { name: 'Dhembje gjuri', category: 'GJURI' },
    { name: 'Dhimbje dhe ënjtje në gju', category: 'GJURI' },
    { name: 'Dhimbje gjuri gjatë ecjes ose ngjitjes së shkallëve', category: 'GJURI' },
    { name: 'Dhimbje në tendinën e Akilit', category: 'SHPUTA' },
    { name: 'Dhimbje në thembër', category: 'SHPUTA' },
  ];

  for (const { name, category } of CANONICAL_COMPLAINTS) {
    await prisma.complaint.upsert({ where: { name }, update: { category }, create: { name, category } });
  }
  console.log(`✅ Ankesat kryesore (${CANONICAL_COMPLAINTS.length}) u krijuan/u përditësuan me kategori`);

  // Migrate legacy seed complaints (old format without category) to their
  // anatomical category — only when category is still null, so any admin
  // edit of the category is never overwritten.
  const LEGACY_CATEGORY_MAP: Record<string, string> = {
    'Dhimbje gjuri djathtas': 'GJURI',
    'Dhimbje gjuri majtas': 'GJURI',
    'Dhimbje këmbë djathtas': 'LOMBOSAKRALE',
    'Dhimbje këmbë majtas': 'LOMBOSAKRALE',
    'Dhimbje qafe djathtas': 'CERVIKALE',
    'Dhimbje qafe majtas': 'CERVIKALE',
    'Dhimbje shpine djathtas': 'LOMBOSAKRALE',
    'Dhimbje shpine majtas': 'LOMBOSAKRALE',
  };
  for (const [name, category] of Object.entries(LEGACY_CATEGORY_MAP)) {
    await prisma.complaint.updateMany({ where: { name, category: null, deletedAt: null }, data: { category } });
  }
  console.log('✅ Migrim kategorish për ankesat ekzistuese u krye');

  // ==========================================
  // MAPPING ANKESA → GJENDJE — keyword-matched so this also covers any
  // complaint an admin already created before this mapping system existed.
  // Only complaints with NO existing links get auto-linked, so manual admin
  // curation is never overwritten by re-running this seed.
  // ==========================================
  const KEYWORD_GROUPS: { keywords: string[]; conditions: string[] }[] = [
    { keywords: ['gjuri', 'gju'], conditions: ['Gonarthrosis', 'Meniscus injury', 'Tendinitis'] },
    { keywords: ['kemb', 'këmb', 'mesi', 'lombo'], conditions: ['Lumboischialgia', 'Sciatica', 'Muscle strain'] },
    { keywords: ['qaf', 'cervik', 'marramendje', 'mpirje'], conditions: ['Cervicalgia', 'Disc Herniation', 'Muscle strain'] },
    { keywords: ['shpin', 'torak'], conditions: ['Lumboischialgia', 'Disc Herniation', 'Muscle strain'] },
    { keywords: ['krah', 'shpatull'], conditions: ['Muscle strain', 'Tendinitis'] },
    { keywords: ['berryl', 'bërryl', 'bërryli'], conditions: ['Tendinitis', 'Muscle strain'] },
    { keywords: ['kyç', 'kyci', 'dor', 'gisht'], conditions: ['Disc Herniation', 'Muscle strain'] },
    { keywords: ['kërdhokull', 'kerdhokull', 'ijë', 'vithe'], conditions: ['Lumboischialgia', 'Muscle strain'] },
    { keywords: ['thembër', 'akil', 'shput'], conditions: ['Tendinitis', 'Muscle strain'] },
  ];

  const allComplaints = await prisma.complaint.findMany({
    where: { deletedAt: null },
    include: { suggestedConditionLinks: { select: { id: true } } },
  });

  let linkedCount = 0;
  for (const complaint of allComplaints) {
    if (complaint.suggestedConditionLinks.length > 0) continue; // already mapped — don't touch
    const nameLower = complaint.name.toLowerCase();
    const group = KEYWORD_GROUPS.find((g) => g.keywords.some((k) => nameLower.includes(k)));
    if (!group) continue; // no keyword match — leave for the admin to map manually

    const links = group.conditions
      .map((conditionName) => conditionsByName.get(conditionName))
      .filter((c): c is { id: string } => !!c)
      .map((c) => ({ complaintId: complaint.id, suggestedConditionId: c.id }));

    if (links.length) {
      await prisma.complaintSuggestedCondition.createMany({ data: links, skipDuplicates: true });
      linkedCount++;
    }
  }
  console.log(`✅ Lidhja Ankesa → Gjendje u plotësua automatikisht (${linkedCount} ankesa)`);

  console.log('\n🎉 Sedi u kompletua me sukses!');
  console.log('\n📋 Kredencialet (username / fjalëkalimi):');
  console.log('   Admin:           xhelalshatri    / Admin123');
  console.log('   Menaxher:        dritonberisha   / Menagjer123');
  console.log('   Fizioterapeut:   artamorina      / Fizioterapeut123');
}

main()
  .catch((e) => {
    console.error('❌ Gabim gjatë sedit:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
