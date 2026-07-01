import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const USER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  avatarUrl: true,
  createdAt: true,
  updatedAt: true,
  userBranches: { include: { branch: true } },
  managedBranches: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(dto: PaginationDto & { role?: Role; branchId?: string }) {
    const page = Number(dto.page) || 1;
    const limit = Number(dto.limit) || 24;
    const { search, role, branchId } = dto;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (branchId) {
      where.userBranches = { some: { branchId } };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: USER_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: users, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('Përdoruesi nuk u gjet');
    return user;
  }

  async create(dto: CreateUserDto) {
    // Only block on active (non-deleted) usernames — soft-deleted users free
    // their username when removed, so the same name can be reused.
    const exists = await this.prisma.user.findFirst({
      where: { username: dto.username, deletedAt: null },
    });
    if (exists) throw new ConflictException('Ky emër përdoruesi është tashmë i regjistruar');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const { password, branchIds, ...rest } = dto;

    const user = await this.prisma.user.create({
      data: {
        ...rest,
        passwordHash,
        userBranches: branchIds?.length
          ? { createMany: { data: branchIds.map((branchId) => ({ branchId })) } }
          : undefined,
      },
      select: USER_SELECT,
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    const { branchIds, password, ...rest } = dto;

    const data: any = { ...rest };
    if (password) data.passwordHash = await bcrypt.hash(password, 10);

    if (branchIds !== undefined) {
      await this.prisma.userBranch.deleteMany({ where: { userId: id } });
      if (branchIds.length) {
        await this.prisma.userBranch.createMany({
          data: branchIds.map((branchId) => ({ userId: id, branchId })),
          skipDuplicates: true,
        });
      }
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
  }

  async remove(id: string, requestingUserId: string) {
    if (id === requestingUserId)
      throw new ForbiddenException('Nuk mund të fshini llogarinë tuaj');
    const user = await this.findOne(id);
    // Rename the username on soft-delete so the original name is immediately
    // available for a new user — a DB-level UNIQUE constraint on username
    // would otherwise block re-registration even though the old record is
    // logically deleted.
    const freedUsername = `${user.username}_deleted_${Date.now()}`;
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, username: freedUsername },
    });
    return { message: 'Përdoruesi u fshi me sukses' };
  }

  async toggleActive(id: string) {
    const user = await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
      select: { id: true, isActive: true },
    });
  }
}
