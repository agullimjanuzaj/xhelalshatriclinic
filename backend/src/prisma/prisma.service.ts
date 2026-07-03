import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    await this.fixSoftDeletedUniqueConflicts();
  }

  // Runs once on every startup — fully idempotent.
  //
  // Problem: TreatmentType, Complaint, SuggestedCondition, Branch, User all
  // have DB-level UNIQUE constraints on name/username. Soft-deleting a record
  // (setting deletedAt) without renaming the field leaves the unique slot
  // occupied, so creating a new record with the same name fails with P2002
  // even though the old record is invisible in the UI.
  //
  // Fix: rename the field on soft-delete to free the slot — service remove()
  // methods already do this for new deletions. This startup pass renames any
  // pre-existing soft-deleted records that were created before that fix landed.
  //
  // Idempotency guard: POSITION('_deleted_' IN field) = 0 ensures we only
  // rename records that haven't already been renamed by the service logic or
  // a previous startup pass.
  private async fixSoftDeletedUniqueConflicts() {
    try {
      await this.$transaction([
        this.$executeRaw`
          UPDATE treatment_types
          SET name = name || '_deleted_' || FLOOR(EXTRACT(EPOCH FROM deleted_at) * 1000)::bigint::text
          WHERE deleted_at IS NOT NULL
            AND POSITION('_deleted_' IN name) = 0
        `,
        this.$executeRaw`
          UPDATE complaints
          SET name = name || '_deleted_' || FLOOR(EXTRACT(EPOCH FROM deleted_at) * 1000)::bigint::text
          WHERE deleted_at IS NOT NULL
            AND POSITION('_deleted_' IN name) = 0
        `,
        this.$executeRaw`
          UPDATE suggested_conditions
          SET name = name || '_deleted_' || FLOOR(EXTRACT(EPOCH FROM deleted_at) * 1000)::bigint::text
          WHERE deleted_at IS NOT NULL
            AND POSITION('_deleted_' IN name) = 0
        `,
        this.$executeRaw`
          UPDATE branches
          SET name = name || '_deleted_' || FLOOR(EXTRACT(EPOCH FROM deleted_at) * 1000)::bigint::text
          WHERE deleted_at IS NOT NULL
            AND POSITION('_deleted_' IN name) = 0
        `,
        this.$executeRaw`
          UPDATE users
          SET username = username || '_deleted_' || FLOOR(EXTRACT(EPOCH FROM deleted_at) * 1000)::bigint::text
          WHERE deleted_at IS NOT NULL
            AND POSITION('_deleted_' IN username) = 0
        `,
      ]);
      this.logger.log('Soft-delete unique conflict cleanup completed');
    } catch (err) {
      // Non-fatal — the backend still starts. The only downside is that some
      // old soft-deleted records keep their original names, so creating a
      // record with that exact name would still fail. Log for visibility.
      this.logger.error('Soft-delete cleanup failed (non-fatal):', err);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async softDelete(model: string, id: string) {
    return (this as any)[model].update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  excludeDeleted<T>(query: T): T & { deletedAt: null } {
    return { ...query, deletedAt: null } as T & { deletedAt: null };
  }
}
