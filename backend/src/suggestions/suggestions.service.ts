import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SuggestionsService {
  constructor(private readonly prisma: PrismaService) {}

  // Union of every active SuggestedCondition linked to any of the given
  // complaints, deduplicated by id. Returns an empty array if the
  // complaints have no mapping yet — the frontend is responsible for
  // telling an ADMIN they should add one ("Gjendjet e sugjeruara: Nuk u
  // gjet asnjë gjendje e sugjeruar"), this endpoint just reports the truth.
  async fromComplaints(complaintIds: string[]) {
    if (!complaintIds?.length) return [];

    const links = await this.prisma.complaintSuggestedCondition.findMany({
      where: { complaintId: { in: complaintIds } },
      include: { suggestedCondition: true },
    });

    const seen = new Map<string, { id: string; name: string }>();
    for (const link of links) {
      const sc = link.suggestedCondition;
      if (!sc || sc.deletedAt || !sc.isActive) continue;
      if (!seen.has(sc.id)) seen.set(sc.id, { id: sc.id, name: sc.name });
    }

    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
}
