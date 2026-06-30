'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Loader2, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { notificationsApi } from '@/lib/api';
import { formatDateTime, cn } from '@/lib/utils';
import { getPatientDetailPath } from '@/lib/routes';
import { useSession } from 'next-auth/react';

const typeColors: Record<string, string> = {
  NEW_PATIENT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  SESSION_COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  TREATMENT_REGISTERED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  PAYMENT_RECEIVED: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  SESSION_SCHEDULED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  PLAN_CREATED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  PATIENT_ACTIVE: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
};

export function NotificationBell({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: authSession } = useSession();
  const role = authSession?.user?.role;

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30_000,
    enabled,
  });
  const unreadCount = (unreadData as any)?.data?.count || 0;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.getAll({ limit: 20 }),
    enabled: enabled && open,
  });
  const notifications = (data as any)?.data || [];

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell size={18} />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] bg-red-500 border-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-medium text-sm">Njoftimet</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheck size={13} />
              Të gjitha të lexuara
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Duke ngarkuar...
            </div>
          )}
          {isError && (
            <div className="py-10 text-center text-sm text-red-600">Ndodhi një gabim gjatë ngarkimit</div>
          )}
          {!isLoading && !isError && notifications.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <BellOff size={28} />
              <p className="text-sm">Nuk ka njoftime</p>
            </div>
          )}
          {!isLoading &&
            !isError &&
            notifications.map((n: any) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.isRead) markRead.mutate(n.id);
                  if (n.data?.patientId) {
                    setOpen(false);
                    router.push(getPatientDetailPath(role, n.data.patientId));
                  }
                }}
                className={cn(
                  'w-full border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/50',
                  !n.isRead && 'bg-teal-50/50 dark:bg-teal-900/10'
                )}
              >
                <div className="flex items-start gap-2">
                  <div className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', n.isRead ? 'bg-muted' : 'bg-teal-500')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{n.title}</p>
                      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', typeColors[n.type] || 'bg-gray-100 text-gray-700')}>
                        {n.type?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(n.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
