'use client';

import { useState, useEffect } from 'react';
import { signIn, useSession, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { getDashboardPath, ROUTES } from '@/lib/routes';

const schema = z.object({
  username: z.string().min(3, 'Emri i përdoruesit duhet të ketë të paktën 3 karaktere'),
  password: z.string().min(1, 'Fjalëkalimi është i detyrueshëm'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { update } = useSession();

  // Defensive: if credentials ever leaked into the URL (e.g. a native form
  // fallback fired before React hydrated), strip them immediately.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('username') || params.has('password')) {
      router.replace(ROUTES.login);
    }
  }, [router]);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = async (data: FormData, event?: React.BaseSyntheticEvent) => {
    event?.preventDefault();
    setIsLoading(true);
    try {
      const result = await signIn('credentials', {
        username: data.username,
        password: data.password,
        redirect: false,
      });

      if (!result || result.error) {
        if (result?.code === 'inactive_account') {
          toast.error('Llogaria është joaktive');
        } else {
          toast.error('Emri i përdoruesit ose fjalëkalimi është i pasaktë');
        }
        setIsLoading(false);
        return;
      }

      // signIn({ redirect: false }) resolves the credentials POST but does NOT
      // refresh the SessionProvider context every useSession() call subscribes
      // to — without this, every page (sidebar, topbar, dashboard) keeps reading
      // the stale pre-login "unauthenticated" state until a window-focus event
      // eventually triggers NextAuth's background refetch. Force it now.
      const freshSession = (await update()) ?? (await getSession());
      queryClient.clear();
      router.replace(getDashboardPath((freshSession as any)?.user?.role));
    } catch {
      toast.error('Ndodhi një gabim. Ju lutemi provoni përsëri.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-1/2 gradient-teal flex-col items-center justify-center p-12 text-white">
        <div className="max-w-md text-center space-y-6">
          <div className="flex items-center justify-center mx-auto">
            <Image src="/icons/icon-192x192.png" alt="Xhelal Shatri Clinic" width={80} height={80} className="rounded-3xl" />
          </div>
          <div>
            <h1 className="text-4xl font-bold mb-3">Xhelal Shatri Clinic</h1>
            <p className="text-white/80 text-lg">Sistemi i Menaxhimit të Fizioterapisë</p>
          </div>
          <div className="space-y-3 text-left">
            {[
              '3 Degë: Prishtina, Peja, Istog',
              'Menaxhim i pacientëve',
              'Seancat dhe trajtimet',
              'Raporte dhe analitika',
              'Fatura PDF profesionale',
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-3 text-white/90">
                <div className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs">✓</span>
                </div>
                {feat}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 justify-center">
            <Image src="/icons/icon-192x192.png" alt="Xhelal Shatri Clinic" width={40} height={40} className="rounded-xl" />
            <div>
              <p className="font-bold text-foreground">Xhelal Shatri Clinic</p>
              <p className="text-xs text-muted-foreground">Fizioterapi & Rehabilitim</p>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-foreground">Mirë se vini!</h2>
            <p className="text-muted-foreground mt-1 text-sm">Identifikohuni për të hyrë në sistem</p>
          </div>

          <Form {...form}>
            <form
              method="post"
              onSubmit={(e) => {
                e.preventDefault();
                form.handleSubmit(onSubmit)(e);
              }}
              className="space-y-4"
            >
              <FormField control={form.control} name="username" render={({ field }) => (
                <FormItem>
                  <FormLabel>Emri i përdoruesit</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="p.sh. xhelalshatri"
                      autoComplete="username"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fjalëkalimi</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Fjalëkalimi juaj"
                        autoComplete="current-password"
                        {...field}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <Button
                type="submit"
                className="w-full gradient-teal text-white border-0 h-11"
                disabled={isLoading}
              >
                {isLoading && <Loader2 size={16} className="mr-2 animate-spin" />}
                Hyr në sistem
              </Button>
            </form>
          </Form>

          <p className="text-center text-xs text-muted-foreground">
            © 2025 Xhelal Shatri Clinic. Të gjitha të drejtat e rezervuara.
          </p>
        </div>
      </div>
    </div>
  );
}
