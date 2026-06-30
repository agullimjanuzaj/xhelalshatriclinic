import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PushService } from './push.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { Request } from 'express';

@ApiTags('Push Notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-public-key')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Merr VAPID public key për subscription' })
  getVapidPublicKey() {
    return this.pushService.getVapidPublicKey();
  }

  @Post('subscribe')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Regjistro subscription të re push' })
  subscribe(@Body() dto: SubscribeDto, @CurrentUser() user: any, @Req() req: Request) {
    // Merge User-Agent from request if not sent explicitly
    if (!dto.userAgent) dto.userAgent = req.headers['user-agent'];
    return this.pushService.subscribe(user.id, dto);
  }

  @Post('unsubscribe')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Çaktivizo subscription (pajisja aktuale ose të gjitha)' })
  unsubscribe(@Body() body: { endpoint?: string }, @CurrentUser() user: any) {
    return this.pushService.unsubscribe(user.id, body.endpoint);
  }

  @Get('status')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Shiko nëse useri ka subscriptions aktive' })
  getStatus(@CurrentUser() user: any) {
    return this.pushService.getStatus(user.id);
  }

  @Post('test')
  @Roles(Role.ADMIN, Role.MANAGER, Role.PHYSIOTHERAPIST)
  @ApiOperation({ summary: 'Dërgo notification testimi te pajisja aktuale' })
  sendTest(@CurrentUser() user: any) {
    return this.pushService.sendTest(user.id);
  }
}
