import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { UpdateTreatmentDto } from './dto/update-treatment.dto';
import { PaginationDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { SymptomType } from '@prisma/client';

// Symptom → Condition suggestion map
const SYMPTOM_CONDITION_MAP: Record<SymptomType, string[]> = {
  NECK_PAIN: ['Cervikalgjia', 'Hernia e diskut cervikal', 'Tortikoli'],
  LOWER_BACK_PAIN: ['Lumboischialgjia', 'Hernia e diskut lumbar', 'Sindroma e Piriformisit'],
  SHOULDER_PAIN: ['Sindroma e shpatullës së ngrirë (Frozen Shoulder)', 'Tendiniti i manshonit rotator', 'Bursiti'],
  KNEE_PAIN: ['Gonarthroza', 'Tendiniti patellar', 'Bursiti i gjurit'],
  LEG_NUMBNESS: ['Neuropatia periferike', 'Lumboischialgjia', 'Sindroma e Piriformisit'],
  ARM_NUMBNESS: ['Cervikalgjia', 'Sindroma e tunelit karpal', 'Neuropatia'],
  LIMITED_MOBILITY: ['Artrita', 'Sindroma e shpatullës së ngrirë', 'Kontraktura'],
  MUSCLE_WEAKNESS: ['Atrofia muskulore', 'Neuropatia', 'Reumatizmi'],
};

@Injectable()
export class TreatmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: PaginationDto & { patientId?: string; physiotherapistId?: string }, user: any) {
    const page = Number(dto.page) || 1;
    const limit = Number(dto.limit) || 24;
    const { patientId, physiotherapistId } = dto;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    if (patientId) where.patientId = patientId;
    if (user.role === 'PHYSIOTHERAPIST') {
      where.physiotherapistId = user.id;
    } else if (physiotherapistId) {
      where.physiotherapistId = physiotherapistId;
    }

    const [treatments, total] = await Promise.all([
      this.prisma.treatment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
          physiotherapist: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.treatment.count({ where }),
    ]);

    return { data: treatments, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string) {
    const treatment = await this.prisma.treatment.findFirst({
      where: { id, deletedAt: null },
      include: {
        patient: { include: { branch: true } },
        physiotherapist: { select: { id: true, firstName: true, lastName: true } },
        session: true,
        treatmentPlan: { select: { id: true, totalSessions: true, completedSessions: true } },
      },
    });
    if (!treatment) throw new NotFoundException('Trajtimi nuk u gjet');
    return treatment;
  }

  async create(dto: CreateTreatmentDto, user: any) {
    const suggestedConditions = this.getSuggestedConditions(dto.symptoms || []);

    const treatment = await this.prisma.treatment.create({
      data: {
        ...dto,
        physiotherapistId: user.role === 'PHYSIOTHERAPIST' ? user.id : (dto.physiotherapistId || user.id),
        suggestedConditions,
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        physiotherapist: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Notify admins
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'CREATE',
        entity: 'treatment',
        entityId: treatment.id,
      },
    });

    return treatment;
  }

  async update(id: string, dto: UpdateTreatmentDto, user: any) {
    await this.findOne(id);
    const suggestedConditions = dto.symptoms ? this.getSuggestedConditions(dto.symptoms) : undefined;
    return this.prisma.treatment.update({
      where: { id },
      data: {
        ...dto,
        ...(suggestedConditions ? { suggestedConditions } : {}),
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        physiotherapist: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.treatment.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Trajtimi u fshi me sukses' };
  }

  async getSuggestions(symptoms: SymptomType[]) {
    const conditions = this.getSuggestedConditions(symptoms);
    return {
      conditions,
      disclaimer:
        'Kjo është vetëm një sugjerim i sistemit dhe nuk përbën diagnozë mjekësore.',
    };
  }

  private getSuggestedConditions(symptoms: SymptomType[]): string[] {
    const conditionSet = new Set<string>();
    for (const symptom of symptoms) {
      const conditions = SYMPTOM_CONDITION_MAP[symptom] || [];
      conditions.forEach((c) => conditionSet.add(c));
    }
    return Array.from(conditionSet);
  }
}
