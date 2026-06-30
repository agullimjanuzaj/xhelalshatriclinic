'use client';

import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { PatientDetailContent } from '@/components/patients/patient-detail-content';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';

export default function PatientDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { status } = useSession();

  if (status === 'loading') return <LoadingSkeleton type="cards" rows={4} />;
  return <PatientDetailContent id={id} />;
}
