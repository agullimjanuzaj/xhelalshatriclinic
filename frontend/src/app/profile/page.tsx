'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { authApi, pushApi } from '@/lib/api';
import {
  getPermissionStatus, isPushSupported, isIOS, isInstalledPWA,
  requestPermission, subscribeToPush, unsubscribeFromPush,
} from '@/lib/push';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { toast } from 'sonner';
import { getRoleLabel, formatDate } from '@/lib/utils';
import { Bell, BellOff, BellRing, Loader2, Smartphone } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';

const pwSchema = z.object({
  currentPassword: z.string().min(1, 'Fjalëkalimi aktual është i detyrueshëm'),
  newPassword: z.string().min(8, 'Minimum 8 karaktere')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Duhet të ketë shkronja të mëdha, të vogla dhe numra'),
});
type PwFormData = z.infer<typeof pwSchema>;

// ── Push Notifications Section ─────────────────────────────────────────────────

function PushNotificationsSection() {
  const [permission, setPermission] = useState<ReturnType<typeof getPermissionStatus>>('default');
  const [supported, setSupported] = useState(false);
  const [iosDevice, setIosDevice] = useState(false);
  const [installedPWA, setInstalledPWA] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPermission(getPermissionStatus());
    setSupported(isPushSupported());
    setIosDevice(isIOS());
    setInstalledPWA(isInstalledPWA());
  }, []);

  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ['push-status'],
    queryFn: () => pushApi.getStatus(),
    enabled: supported && permission === 'granted',
  });
  const pushActive = (statusData as any)?.data?.active === true;

  const testMutation = useMutation({
    mutationFn: () => pushApi.sendTest(),
    onSuccess: () => toast.success('Notification testimi u dërgua!'),
    onError: () => toast.error('Dërgimi i testimit dështoi'),
  });

  const handleActivate = async () => {
    setBusy(true);
    try {
      // 1. Ask for browser permission if not yet granted
      if (permission === 'default') {
        const result = await requestPermission();
        setPermission(result);
        if (result !== 'granted') {
          setBusy(false);
          return;
        }
      }
      // 2. Create the push subscription in the browser
      const sub = await subscribeToPush();
      if (!sub) {
        if (iosDevice && !installedPWA) {
          toast.error('Instalo aplikacionin në Home Screen të iPhone: Share → "Add to Home Screen", pastaj hape nga aty dhe provo sërish.');
        } else if (!isPushSupported()) {
          toast.error('Shfletuesi ose pajisja juaj nuk mbështet njoftimet push.');
        } else {
          toast.error('Nuk u krijua subscription. Provo të rindizësh faqen ose kontakto administratorin.');
        }
        setBusy(false);
        return;
      }
      // 3. Register with backend
      await pushApi.subscribe({ ...sub, userAgent: navigator.userAgent });
      await refetchStatus();
      toast.success('Njoftimet u aktivizuan!');
    } catch (err) {
      toast.error('Aktivizimi dështoi. Provo përsëri.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async () => {
    setBusy(true);
    try {
      const endpoint = await unsubscribeFromPush();
      await pushApi.unsubscribe(endpoint ?? undefined);
      await refetchStatus();
      setPermission(getPermissionStatus());
      toast.success('Njoftimet u çaktivizuan.');
    } catch {
      toast.error('Çaktivizimi dështoi.');
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell size={16} />Njoftimet</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Njoftimet push nuk mbështeten në këtë shfletues ose pajisje.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell size={16} />Njoftimet
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* iOS non-installed warning */}
        {iosDevice && !installedPWA && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl">
            <Smartphone size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Në iPhone, njoftimet funksionojnë vetëm kur aplikacioni është instaluar në Home Screen.
              Hap Share → "Add to Home Screen", hap applikacionin nga Home Screen dhe provo sërish.
            </p>
          </div>
        )}

        {/* Current status */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Statusi i njoftimeve</p>
            {permission === 'denied' ? (
              <p className="text-xs text-red-600 mt-0.5">
                Leja nuk është dhënë — aktivizoje te cilësimet e shfletuesit
                (Settings → Notifications → {window?.location?.hostname}).
              </p>
            ) : pushActive ? (
              <p className="text-xs text-teal-600 mt-0.5">Të aktivizuara</p>
            ) : permission === 'granted' ? (
              <p className="text-xs text-amber-600 mt-0.5">Të çaktivizuara</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">Leja nuk është dhënë</p>
            )}
          </div>
          {permission === 'denied' ? (
            <Badge variant="destructive" className="gap-1"><BellOff size={12} />Bllokuar</Badge>
          ) : pushActive ? (
            <Badge className="gap-1 bg-teal-500 text-white"><BellRing size={12} />Aktive</Badge>
          ) : (
            <Badge variant="secondary" className="gap-1"><BellOff size={12} />Joaktive</Badge>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {!pushActive && permission !== 'denied' && (
            <Button
              size="sm"
              className="gradient-teal text-white border-0 gap-2"
              disabled={busy || (iosDevice && !installedPWA)}
              onClick={handleActivate}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
              Aktivizo njoftimet
            </Button>
          )}
          {pushActive && (
            <>
              <Button size="sm" variant="outline" className="gap-2" disabled={busy} onClick={handleDeactivate}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <BellOff size={13} />}
                Çaktivizo njoftimet
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-2 text-teal-600"
                disabled={testMutation.isPending}
                onClick={() => testMutation.mutate()}
              >
                {testMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <BellRing size={13} />}
                Testo
              </Button>
            </>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Njoftimet dërgohen kur ka aktivitet të rëndësishëm: pacient aktiv, trajtim i ri, pagesë ose seancë e përfunduar.
          Push notifications funksionojnë edhe kur aplikacioni është i mbyllur.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Main profile page ──────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { data: session } = useSession();

  const { data: profileData } = useQuery({
    queryKey: ['profile'],
    queryFn: () => authApi.getProfile(),
  });
  const profile = (profileData as any)?.data;

  const form = useForm<PwFormData>({ resolver: zodResolver(pwSchema) });

  const mutation = useMutation({
    mutationFn: (data: PwFormData) => authApi.changePassword(data),
    onSuccess: () => {
      toast.success('Fjalëkalimi u ndryshua me sukses!');
      form.reset();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-xl font-bold">Profili im</h1>

        {/* Profile Info */}
        <Card>
          <CardHeader><CardTitle className="text-base">Të dhënat personale</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl gradient-teal flex items-center justify-center text-white text-2xl font-bold">
                {session?.user?.name?.[0] || 'U'}
              </div>
              <div>
                <h2 className="text-lg font-bold">{session?.user?.name}</h2>
                <p className="text-sm text-muted-foreground">@{session?.user?.username}</p>
                <Badge className="mt-1">{getRoleLabel(session?.user?.role || '')}</Badge>
              </div>
            </div>

            {profile && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <p className="text-xs text-muted-foreground">Telefoni</p>
                  <p className="text-sm font-medium">{profile.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Anëtar që nga</p>
                  <p className="text-sm font-medium">{formatDate(profile.createdAt)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Degët</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(profile.userBranches || []).map((ub: any) => (
                      <Badge key={ub.id} variant="outline">{ub.branch?.name}</Badge>
                    ))}
                    {!profile.userBranches?.length && <p className="text-sm">—</p>}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Push Notifications */}
        <PushNotificationsSection />

        {/* Change Password */}
        <Card>
          <CardHeader><CardTitle className="text-base">Ndrysho fjalëkalimin</CardTitle></CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
                <FormField control={form.control} name="currentPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fjalëkalimi aktual</FormLabel>
                    <FormControl><Input type="password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="newPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fjalëkalimi i ri</FormLabel>
                    <FormControl><Input type="password" placeholder="Minimum 8 karaktere" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" disabled={mutation.isPending} className="gradient-teal text-white border-0">
                  {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                  Ndrysho fjalëkalimin
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
