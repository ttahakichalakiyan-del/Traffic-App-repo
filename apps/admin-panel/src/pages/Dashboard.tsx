import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Users, UserCheck, Navigation, Bell, Activity, Cpu, Database, Clock,
} from 'lucide-react';
import api from '../lib/api';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface ApiListResponse<T> {
  success: boolean;
  data: {
    items?: T[];
    total?: number;
    count?: number;
  };
  error: string | null;
  timestamp: string;
}

interface ApiCountResponse {
  success: boolean;
  data: { count: number } | number;
  error: string | null;
  timestamp: string;
}

interface HealthResponse {
  success?: boolean;
  status?: string;
  data?: {
    uptime?: number;
    socketConnections?: number;
    lastPrediction?: string;
  };
  uptime?: number;
  socketConnections?: number;
  lastPrediction?: string;
}

interface ActivityEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  level?: 'info' | 'warning' | 'error';
}

interface ActivityResponse {
  success: boolean;
  data: ActivityEvent[] | { events?: ActivityEvent[] };
  error: string | null;
  timestamp: string;
}

// ──────────────────────────────────────────────
// Mock / helpers
// ──────────────────────────────────────────────

const MOCK_ACTIVITY: ActivityEvent[] = [
  { id: '1',  type: 'auth',    message: 'Admin login: admin01',              timestamp: new Date(Date.now() - 2  * 60000).toISOString(), level: 'info'    },
  { id: '2',  type: 'staff',   message: 'New staff member added: Ali Raza',  timestamp: new Date(Date.now() - 5  * 60000).toISOString(), level: 'info'    },
  { id: '3',  type: 'alert',   message: 'High traffic at Mall Road junction',timestamp: new Date(Date.now() - 8  * 60000).toISOString(), level: 'warning' },
  { id: '4',  type: 'roster',  message: 'Roster updated for Zone-3',         timestamp: new Date(Date.now() - 15 * 60000).toISOString(), level: 'info'    },
  { id: '5',  type: 'dsp',     message: 'DSP User #1043 checked in',         timestamp: new Date(Date.now() - 22 * 60000).toISOString(), level: 'info'    },
  { id: '6',  type: 'alert',   message: 'Signal failure reported: Gulberg',  timestamp: new Date(Date.now() - 30 * 60000).toISOString(), level: 'error'   },
  { id: '7',  type: 'area',    message: 'New area created: Johar Town East', timestamp: new Date(Date.now() - 45 * 60000).toISOString(), level: 'info'    },
  { id: '8',  type: 'staff',   message: 'Staff shift change: Model Town',    timestamp: new Date(Date.now() - 60 * 60000).toISOString(), level: 'info'    },
  { id: '9',  type: 'dsp',     message: 'DSP User #0987 checked out',        timestamp: new Date(Date.now() - 75 * 60000).toISOString(), level: 'info'    },
  { id: '10', type: 'alert',   message: 'Accident reported near DHA Phase-5',timestamp: new Date(Date.now() - 90 * 60000).toISOString(), level: 'warning' },
];

const MOCK_CHART_DATA = [
  { time: '00:00', active: 42 }, { time: '02:00', active: 28 }, { time: '04:00', active: 18 },
  { time: '06:00', active: 35 }, { time: '08:00', active: 87 }, { time: '10:00', active: 95 },
  { time: '12:00', active: 78 }, { time: '14:00', active: 82 }, { time: '16:00', active: 91 },
  { time: '18:00', active: 103 },{ time: '20:00', active: 74 }, { time: '22:00', active: 55 },
];

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const LEVEL_DOT: Record<string, string> = {
  info:    'bg-blue-400',
  warning: 'bg-amber-400',
  error:   'bg-red-400',
};

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  iconBg: string;
  loading: boolean;
  trend?: string;
}

function MetricCard({ label, value, icon, iconBg, loading, trend }: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          {loading ? (
            <div className="mt-2 h-8 w-20 bg-slate-200 rounded animate-pulse" />
          ) : (
            <p className="mt-1 text-3xl font-bold text-slate-800">{value}</p>
          )}
          {trend && !loading && (
            <p className="mt-1 text-xs text-slate-400">{trend}</p>
          )}
        </div>
        <div className={`${iconBg} p-3 rounded-xl`}>{icon}</div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm animate-pulse">
      <div className="flex items-start justify-between">
        <div>
          <div className="h-4 w-24 bg-slate-200 rounded" />
          <div className="mt-2 h-8 w-16 bg-slate-200 rounded" />
        </div>
        <div className="w-12 h-12 bg-slate-200 rounded-xl" />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Dashboard
// ──────────────────────────────────────────────

export default function Dashboard() {
  // --- Metric queries ---
  const { data: dspData, isLoading: dspLoading } = useQuery({
    queryKey: ['dsp-users-count'],
    queryFn: async () => {
      const res = await api.get<ApiListResponse<unknown>>('/admin/dsp-users?limit=1');
      return res.data;
    },
    select: (d) => d.data?.total ?? d.data?.count ?? 0,
  });

  const { data: staffData, isLoading: staffLoading } = useQuery({
    queryKey: ['staff-count'],
    queryFn: async () => {
      const res = await api.get<ApiListResponse<unknown>>('/admin/staff?limit=1');
      return res.data;
    },
    select: (d) => d.data?.total ?? d.data?.count ?? 0,
  });

  const { data: onDutyData, isLoading: onDutyLoading } = useQuery({
    queryKey: ['staff-on-duty'],
    queryFn: async () => {
      const res = await api.get<ApiListResponse<unknown>>('/admin/staff?status=onDuty&limit=1');
      return res.data;
    },
    select: (d) => d.data?.total ?? d.data?.count ?? 0,
    refetchInterval: 30000,
  });

  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: ['active-alerts-count'],
    queryFn: async () => {
      try {
        const res = await api.get<ApiCountResponse>('/alerts/active-count');
        return res.data;
      } catch {
        return { success: false, data: 0, error: null, timestamp: '' };
      }
    },
    select: (d) => {
      if (typeof d.data === 'number') return d.data;
      if (typeof d.data === 'object' && d.data !== null && 'count' in d.data) {
        return (d.data as { count: number }).count;
      }
      return 0;
    },
  });

  // --- Activity feed ---
  const { data: activityEvents, isLoading: activityLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: async () => {
      try {
        const res = await api.get<ActivityResponse>('/admin/system/activity');
        return res.data;
      } catch {
        return null;
      }
    },
    select: (d): ActivityEvent[] => {
      if (!d) return MOCK_ACTIVITY;
      if (Array.isArray(d.data)) return d.data.slice(0, 15);
      if (d.data && typeof d.data === 'object' && 'events' in d.data) {
        return (d.data as { events: ActivityEvent[] }).events.slice(0, 15);
      }
      return MOCK_ACTIVITY;
    },
    refetchInterval: 15000,
  });

  // --- Backend health ---
  const { data: backendHealth } = useQuery({
    queryKey: ['health-backend'],
    queryFn: async () => {
      try {
        const res = await api.get<HealthResponse>('/health');
        return { ok: true, data: res.data };
      } catch {
        return { ok: false, data: null };
      }
    },
    refetchInterval: 30000,
  });

  // --- ML engine health ---
  const mlUrl = (import.meta.env.VITE_ML_URL as string | undefined) || 'http://localhost:8001';
  const { data: mlHealth } = useQuery({
    queryKey: ['health-ml'],
    queryFn: async () => {
      try {
        const res = await fetch(`${mlUrl}/health`, { signal: AbortSignal.timeout(5000) });
        const json = (await res.json()) as HealthResponse;
        return { ok: true, data: json };
      } catch {
        return { ok: false, data: null };
      }
    },
    refetchInterval: 30000,
  });

  // Derived health info
  const backendOk = backendHealth?.ok ?? false;
  const mlOk = mlHealth?.ok ?? false;
  const socketConns: number =
    backendHealth?.data?.data?.socketConnections ??
    backendHealth?.data?.socketConnections ??
    0;
  const lastPrediction: string =
    mlHealth?.data?.data?.lastPrediction ??
    mlHealth?.data?.lastPrediction ??
    '—';

  return (
    <div className="space-y-6">
      {/* ── Metric cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {dspLoading ? (
          <SkeletonCard />
        ) : (
          <MetricCard
            label="Total DSPs"
            value={dspData ?? 0}
            icon={<Users size={22} className="text-blue-600" />}
            iconBg="bg-blue-50"
            loading={false}
            trend="Registered DSP users"
          />
        )}
        {staffLoading ? (
          <SkeletonCard />
        ) : (
          <MetricCard
            label="Total Staff"
            value={staffData ?? 0}
            icon={<UserCheck size={22} className="text-green-600" />}
            iconBg="bg-green-50"
            loading={false}
            trend="All staff members"
          />
        )}
        {onDutyLoading ? (
          <SkeletonCard />
        ) : (
          <MetricCard
            label="On Duty Now"
            value={onDutyData ?? 0}
            icon={<Navigation size={22} style={{ color: '#0d9488' }} />}
            iconBg="bg-teal-50"
            loading={false}
            trend="Live · updates every 30s"
          />
        )}
        {alertsLoading ? (
          <SkeletonCard />
        ) : (
          <MetricCard
            label="Active Alerts"
            value={alertsData ?? 0}
            icon={<Bell size={22} className="text-red-500" />}
            iconBg="bg-red-50"
            loading={false}
            trend="Requires attention"
          />
        )}
      </div>

      {/* ── Chart + bottom two panels ── */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Activity size={18} className="text-slate-400" />
            Staff On-Duty (24h trend)
          </h2>
          <span className="text-xs text-slate-400">Today</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={MOCK_CHART_DATA} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="navyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#1A3A5C" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#1A3A5C" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={30} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              itemStyle={{ color: '#1A3A5C' }}
            />
            <Area
              type="monotone"
              dataKey="active"
              stroke="#1A3A5C"
              strokeWidth={2}
              fill="url(#navyGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Live Activity + System Health ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Live Activity Feed – 60% */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Clock size={18} className="text-slate-400" />
              Live Activity
            </h2>
            <span className="text-xs text-slate-400">Auto-refresh 15s</span>
          </div>

          {activityLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-200 flex-shrink-0" />
                  <div className="flex-1 h-4 bg-slate-200 rounded" />
                  <div className="w-12 h-3 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {(activityEvents ?? MOCK_ACTIVITY).map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 group">
                  <div
                    className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      LEVEL_DOT[ev.level ?? 'info'] ?? 'bg-blue-400'
                    }`}
                  />
                  <p className="flex-1 text-sm text-slate-600 group-hover:text-slate-800 transition-colors leading-snug">
                    {ev.message}
                  </p>
                  <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">
                    {timeAgo(ev.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* System Health – 40% */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-4">
            <Cpu size={18} className="text-slate-400" />
            System Health
          </h2>

          <div className="space-y-3">
            {/* Backend API */}
            <div className="flex items-center justify-between py-2.5 border-b border-slate-50">
              <div className="flex items-center gap-2.5">
                <Database size={16} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-700">Backend API</span>
              </div>
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${backendOk ? 'text-green-600' : 'text-red-500'}`}>
                <span className={`w-2 h-2 rounded-full ${backendOk ? 'bg-green-500' : 'bg-red-500'}`} />
                {backendOk ? 'Operational' : 'Down'}
              </span>
            </div>

            {/* ML Engine */}
            <div className="flex items-center justify-between py-2.5 border-b border-slate-50">
              <div className="flex items-center gap-2.5">
                <Cpu size={16} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-700">ML Engine</span>
              </div>
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${mlOk ? 'text-green-600' : 'text-red-500'}`}>
                <span className={`w-2 h-2 rounded-full ${mlOk ? 'bg-green-500' : 'bg-red-500'}`} />
                {mlOk ? 'Operational' : 'Down'}
              </span>
            </div>

            {/* Socket Connections */}
            <div className="flex items-center justify-between py-2.5 border-b border-slate-50">
              <div className="flex items-center gap-2.5">
                <Activity size={16} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-700">Socket Connections</span>
              </div>
              <span className="text-xs font-bold text-slate-700">{socketConns}</span>
            </div>

            {/* Last Prediction */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5">
                <Clock size={16} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-700">Last Prediction</span>
              </div>
              <span className="text-xs text-slate-500 truncate max-w-[120px]" title={lastPrediction}>
                {lastPrediction}
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Online</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Offline</span>
            <span className="ml-auto">Refresh 30s</span>
          </div>
        </div>
      </div>
    </div>
  );
}
