'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api';
import { useAppStore } from '@/store/use-app-store';
import { formatCurrency } from '@/lib/utils';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-border rounded-lg p-3 shadow-lg">
        <p className="text-xs font-medium text-foreground mb-1">{label}</p>
        <p className="text-sm font-bold text-teal-600">{formatCurrency(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

export function RevenueChart() {
  const { selectedBranchId } = useAppStore();

  const { data, isLoading } = useQuery({
    queryKey: ['revenue-chart', selectedBranchId],
    queryFn: () => dashboardApi.getRevenueChart({ branchId: selectedBranchId || undefined }),
  });

  const chartData = (data as any)?.data || [];

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
        Duke ngarkuar grafikun...
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}€`} />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="#0d9488"
          strokeWidth={2}
          fill="url(#revenueGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
