import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDefaultRedirect } from '@/lib/routes';

export default async function HomePage() {
  const session = await auth();
  redirect(getDefaultRedirect(session?.user?.role));
}
