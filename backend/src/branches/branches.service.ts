import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.branch.findMany({
      where: { deletedAt: null },
      include: {
        manager: {
          select: { id: true, firstName: true, lastName: true, username: true },
        },
        _count: {
          select: { patients: true, sessions: true, userBranches: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
      include: {
        manager: {
          select: { id: true, firstName: true, lastName: true, username: true, phone: true },
        },
        userBranches: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, role: true, isActive: true } },
          },
          where: { user: { deletedAt: null } },
        },
        _count: { select: { patients: true, sessions: true } },
      },
    });
    if (!branch) throw new NotFoundException('Dega nuk u gjet');
    return branch;
  }

  async create(dto: CreateBranchDto) {
    const exists = await this.prisma.branch.findFirst({ where: { name: dto.name, deletedAt: null } });
    if (exists) throw new ConflictException('Një degë me këtë emër ekziston tashmë');
    return this.prisma.branch.create({ data: dto });
  }

  async update(id: string, dto: UpdateBranchDto) {
    await this.findOne(id);
    return this.prisma.branch.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.branch.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Dega u fshi me sukses' };
  }

  async getStats(id: string) {
    await this.findOne(id);
    const [patients, sessions, revenue] = await Promise.all([
      this.prisma.patient.count({ where: { branchId: id, deletedAt: null } }),
      this.prisma.session.count({ where: { branchId: id, status: 'COMPLETED', deletedAt: null } }),
      this.prisma.payment.aggregate({
        where: { branchId: id, status: 'PAID', deletedAt: null },
        _sum: { amount: true },
      }),
    ]);
    return {
      totalPatients: patients,
      completedSessions: sessions,
      totalRevenue: revenue._sum.amount || 0,
    };
  }
}
