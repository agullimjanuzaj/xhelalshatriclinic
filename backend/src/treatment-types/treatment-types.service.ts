import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTreatmentTypeDto } from './dto/create-treatment-type.dto';
import { UpdateTreatmentTypeDto } from './dto/update-treatment-type.dto';

@Injectable()
export class TreatmentTypesService {
  constructor(private readonly prisma: PrismaService) {}

  // `activeOnly` is what the create/edit treatment-plan checkbox list uses —
  // an admin who deactivates a type should stop seeing it offered for new
  // plans without breaking the display of plans that already used it.
  async findAll(activeOnly = false) {
    return this.prisma.treatmentType.findMany({
      where: { deletedAt: null, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateTreatmentTypeDto) {
    const existing = await this.prisma.treatmentType.findFirst({ where: { name: dto.name, deletedAt: null } });
    if (existing) throw new ConflictException('Ky lloj trajtimi ekziston tashmë');
    return this.prisma.treatmentType.create({ data: dto });
  }

  async update(id: string, dto: UpdateTreatmentTypeDto) {
    const existing = await this.prisma.treatmentType.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Lloji i trajtimit nuk u gjet');
    return this.prisma.treatmentType.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const existing = await this.prisma.treatmentType.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Lloji i trajtimit nuk u gjet');
    // TreatmentType names are stored denormalized as String[] in plans/sessions — no FK rows to clean
    await this.prisma.treatmentType.delete({ where: { id } });
    return { message: 'Lloji i trajtimit u fshi me sukses' };
  }
}
