import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribeDto } from './dto/subscribe.dto';
import * as webpush from 'web-push';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

// Infer a rough platform from the User-Agent string — used only for
// display / icon selection on the frontend, never for security decisions.
function inferPlatform(ua?: string): string {
  if (!ua) return 'other';
  const u = ua.toLowerCase();
  if (/iphone|ipad/.test(u)) return 'ios';
  if (/android/.test(u)) return 'android';
  if (/windows|macintosh|linux/.test(u)) return 'desktop';
  return 'other';
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@xhelalshatri.com';

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
    } else {
      this.logger.warn('VAPID keys not configured — push notifications disabled');
    }
  }

  // ---------- Public VAPID key (sent to frontend for subscription setup) -----

  getVapidPublicKey() {
    return { publicKey: process.env.VAPID_PUBLIC_KEY || '' };
  }

  // ---------- Subscription management ----------------------------------------

  async subscribe(userId: string, dto: SubscribeDto) {
    const platform = inferPlatform(dto.userAgent);
    const sub = await this.prisma.pushSubscription.upsert({
      where: { userId_endpoint: { userId, endpoint: dto.endpoint } },
      update: {
        p256dh: dto.p256dh,
        auth: dto.auth,
        platform,
        userAgent: dto.userAgent,
        isActive: true,
      },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        platform,
        userAgent: dto.userAgent,
        isActive: true,
      },
    });
    return { success: true, id: sub.id, platform };
  }

  async unsubscribe(userId: string, endpoint?: string) {
    if (endpoint) {
      // Deactivate specific device
      await this.prisma.pushSubscription.updateMany({
        where: { userId, endpoint, isActive: true },
        data: { isActive: false },
      });
    } else {
      // Deactivate all devices for this user
      await this.prisma.pushSubscription.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });
    }
    return { success: true };
  }

  async getStatus(userId: string) {
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId, isActive: true },
      select: { id: true, platform: true, createdAt: true, updatedAt: true },
    });
    return { active: subs.length > 0, subscriptions: subs };
  }

  // ---------- Sending ---------------------------------------------------------

  // Send to all active subscriptions of a single user.
  async sendToUser(userId: string, payload: PushPayload) {
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId, isActive: true },
    });
    await this.sendToSubscriptions(subs, payload);
  }

  // Send to multiple users in parallel.
  async sendToUsers(userIds: string[], payload: PushPayload) {
    if (!userIds.length) return;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: userIds }, isActive: true },
    });
    await this.sendToSubscriptions(subs, payload);
  }

  private async sendToSubscriptions(subs: any[], payload: PushPayload) {
    if (!subs.length) return;
    if (!process.env.VAPID_PUBLIC_KEY) return;

    const notif = {
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icons/icon-192x192.png',
      badge: payload.badge || '/icons/icon-72x72.png',
      url: payload.url || '/',
      tag: payload.tag || 'notification',
    };

    const results = await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(notif),
          );
        } catch (err: any) {
          // 410 Gone and 404 Not Found = subscription expired/revoked — remove it.
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            this.logger.debug(`Removing stale push subscription ${sub.id}`);
            await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            this.logger.warn(`Push to ${sub.id} failed: ${err?.message}`);
          }
        }
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) this.logger.warn(`${failed}/${subs.length} push sends failed`);
  }

  // Send a test notification so the user can verify their subscription works.
  async sendTest(userId: string) {
    const status = await this.getStatus(userId);
    if (!status.active) return { sent: false, reason: 'no_active_subscription' };
    await this.sendToUser(userId, {
      title: 'Xhelal Shatri Clinic',
      body: 'Njoftimet janë aktive! Ju do të merrni njoftime për aktivitetin e klinikës.',
      url: '/paneli',
      tag: 'test',
    });
    return { sent: true };
  }
}
