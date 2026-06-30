import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './dto/login.dto';
import { v4 as uuidv4 } from 'uuid';
import * as dayjs from 'dayjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateUser(username: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { username, deletedAt: null },
      include: {
        userBranches: { include: { branch: true } },
        managedBranches: true,
      },
    });
    if (!user) throw new UnauthorizedException('Emri i përdoruesit ose fjalëkalimi është i pasaktë');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Emri i përdoruesit ose fjalëkalimi është i pasaktë');

    if (!user.isActive) throw new UnauthorizedException('Llogaria është joaktive');

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.username, dto.password);
    const tokens = await this.generateTokens(user.id, user.username, user.role);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: dayjs()
          .add(parseInt(this.config.get('JWT_REFRESH_EXPIRES_IN', '7').replace('d', '')), 'day')
          .toDate(),
      },
    });

    await this.prisma.auditLog.create({
      data: { userId: user.id, action: 'LOGIN', entity: 'auth' },
    });

    const { passwordHash, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, ...tokens };
  }

  async refreshTokens(token: string) {
    const stored = await this.prisma.refreshToken.findFirst({
      where: { token },
      include: { user: true },
    });

    if (!stored || dayjs().isAfter(stored.expiresAt)) {
      throw new UnauthorizedException('Token i skaduar ose i pavlefshëm');
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const tokens = await this.generateTokens(stored.user.id, stored.user.username, stored.user.role);
    await this.prisma.refreshToken.create({
      data: {
        userId: stored.user.id,
        token: tokens.refreshToken,
        expiresAt: dayjs().add(7, 'day').toDate(),
      },
    });

    return tokens;
  }

  async logout(userId: string, token?: string) {
    if (token) {
      await this.prisma.refreshToken.deleteMany({ where: { token } });
    } else {
      await this.prisma.refreshToken.deleteMany({ where: { userId } });
    }
    await this.prisma.auditLog.create({
      data: { userId, action: 'LOGOUT', entity: 'auth' },
    });
    return { message: 'U çkyçët me sukses' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        userBranches: { include: { branch: true } },
        managedBranches: true,
      },
    });
    if (!user) throw new UnauthorizedException('Përdoruesi nuk u gjet');
    const { passwordHash, ...result } = user;
    return result;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Përdoruesi nuk u gjet');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Fjalëkalimi aktual është i pasaktë');

    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
    await this.prisma.refreshToken.deleteMany({ where: { userId } });

    return { message: 'Fjalëkalimi u ndryshua me sukses' };
  }

  private async generateTokens(userId: string, username: string, role: string) {
    const payload = { sub: userId, username, role };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = uuidv4();

    return { accessToken, refreshToken };
  }
}
