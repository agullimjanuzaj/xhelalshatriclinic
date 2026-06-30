import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction } from '@prisma/client';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const method = request.method;
    const url = request.url;

    const actionMap: Record<string, AuditAction> = {
      POST: AuditAction.CREATE,
      PUT: AuditAction.UPDATE,
      PATCH: AuditAction.UPDATE,
      DELETE: AuditAction.DELETE,
      GET: AuditAction.VIEW,
    };

    return next.handle().pipe(
      tap(async () => {
        if (user && method !== 'GET') {
          try {
            await this.prisma.auditLog.create({
              data: {
                userId: user.id,
                action: actionMap[method] || AuditAction.VIEW,
                entity: this.extractEntity(url),
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
              },
            });
          } catch {}
        }
      }),
    );
  }

  private extractEntity(url: string): string {
    const parts = url.split('/').filter(Boolean);
    const apiIndex = parts.indexOf('v1');
    return parts[apiIndex + 1] || 'unknown';
  }
}
