import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSuggestedConditionDto } from './dto/create-suggested-condition.dto';
import { UpdateSuggestedConditionDto } from './dto/update-suggested-condition.dto';

@Injectable()
export class SuggestedConditionsService {
  constructor(private readonly prisma: PrismaService) {}

  // `activeOnly` is what the Complaint↔SuggestedCondition mapping editor
  // uses to offer conditions — an admin who deactivates one stops offering
  // it for new mappings without breaking complaints that already link to it.
  async findAll(activeOnly = false) {
    return this.prisma.suggestedCondition.findMany({
      where: { deletedAt: null, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateSuggestedConditionDto) {
    const existing = await this.prisma.suggestedCondition.findFirst({ where: { name: dto.name, deletedAt: null } });
    if (existing) throw new ConflictException('Kjo gjendje ekziston tashmë');
    return this.prisma.suggestedCondition.create({ data: dto });
  }

  async update(id: string, dto: UpdateSuggestedConditionDto) {
    const existing = await this.prisma.suggestedCondition.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Gjendja nuk u gjet');
    return this.prisma.suggestedCondition.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const existing = await this.prisma.suggestedCondition.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Gjendja nuk u gjet');
    // ComplaintSuggestedCondition rows cascade automatically (onDelete: Cascade)
    await this.prisma.suggestedCondition.delete({ where: { id } });
    return { message: 'Gjendja u fshi me sukses' };
  }
}
