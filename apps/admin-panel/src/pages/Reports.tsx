import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';
import { Download, TrendingUp, TrendingDown } from 'lucide-react';
import api from '../lib/api';

const CHART_COLORS = ['#1A3A5C', '#2563EB', '#0d9488', '#f59e0b', '#ef4444', '#8b5cf6'];

interface AttendanceRecord {
  id: string;
  badgeId: string;
  fullName: string;
  rank: string | null;
  sectorName: string | null;
  present: number;
  absent: number;
  rest: number;
  total: number;
}

interface MlAccuracyPoint {
  date: string;
  accuracy: number;
  areaName?: string;
}

interface MlAccuracyResponse {
  data: MlAccuracyPoint[];
  areaBreakdown?: { areaName: string; data: MlAccuracyPoint[] }[];
}

interface AlertRecord {
  id: string;
  createdAt: string;
  roadName: string | null;
  alertType: string;
  severity: string | null;
  resolvedMinutes: number | null;
  areaId: string | null;
}

interface AreaOption {
  id: string;
  name: string;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-10 bg-slate-200 rounded animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <TrendingUp size={40} className="mb-2 opacity-30" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

// Tab 1: Attendance Summary
function AttendanceTab({ areas }: { areas: AreaOption[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(thirtyAgo);
  const [to, setTo] = useState(today);
  const [dspFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['attendance', from, to, dspFilter, areaFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      if (dspFilter) params.set('dspId', dspFilter);
      if (areaFilter) params.set('areaId', areaFilter);
      const res = await api.get(`/admin/reports/attendance?${params}`);
      return res.data.data as AttendanceRecord[];
    },
    enabled,
  });

  const records: AttendanceRecord[] = data ?? [];

  const handleExport = () => {
    if (!records.length) return;
    const headers = ['badgeId', 'fullName', 'rank', 'sectorName', 'present', 'absent', 'rest', 'total', 'presentPct'];
    const rows = records.map(r => [
      r.badgeId, r.fullName, r.rank ?? '', r.sectorName ?? '',
      r.present, r.absent, r.rest, r.total,
      r.total > 0 ? `${Math.round((r.present / r.total) * 100)}%` : '0%',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">From:</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">To:</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Sab Areas</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={() => setEnabled(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
            {isFetching && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Generate Report
          </button>
          {records.length > 0 && (
            <button onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50">
              <Download size={15} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {!enabled ? (
          <EmptyState text="Filters lagayen aur Generate Report dabayein" />
        ) : isLoading ? (
          <div className="p-4"><LoadingSkeleton /></div>
        ) : records.length === 0 ? (
          <EmptyState text="Is period ke liye koi data nahi" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Name', 'Badge', 'Rank', 'Sector', 'Present', 'Absent', 'Rest', 'Total', 'Present%'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const pct = r.total > 0 ? Math.round((r.present / r.total) * 100) : 0;
                  return (
                    <tr key={r.id} className={`border-b border-slate-100 hover:bg-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      <td className="px-4 py-3 font-medium text-slate-800">{r.fullName}</td>
                      <td className="px-4 py-3 font-mono text-sm">{r.badgeId}</td>
                      <td className="px-4 py-3 text-slate-600">{r.rank ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.sectorName ?? '-'}</td>
                      <td className="px-4 py-3 text-green-700 font-medium">{r.present}</td>
                      <td className="px-4 py-3 text-red-600">{r.absent}</td>
                      <td className="px-4 py-3 text-slate-500">{r.rest}</td>
                      <td className="px-4 py-3 text-slate-700">{r.total}</td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${pct >= 80 ? 'text-green-700' : pct >= 60 ? 'text-orange-600' : 'text-red-600'}`}>
                          {pct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Tab 2: ML Accuracy
function MlAccuracyTab({ areas }: { areas: AreaOption[] }) {
  const [areaFilter, setAreaFilter] = useState('');
  const [days, setDays] = useState('14');
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['ml-accuracy', areaFilter, days],
    queryFn: async () => {
      const params = new URLSearchParams({ days });
      if (areaFilter) params.set('areaId', areaFilter);
      try {
        const res = await api.get(`/predictions/accuracy-report?${params}`);
        return res.data.data as MlAccuracyResponse;
      } catch {
        // Fallback to ML service
        const res = await fetch(`http://localhost:8001/accuracy-report?${params}`);
        const json = await res.json();
        return json as MlAccuracyResponse;
      }
    },
    enabled,
  });

  const points: MlAccuracyPoint[] = data?.data ?? [];
  const areaLines = data?.areaBreakdown ?? [];

  const best = points.length > 0 ? Math.max(...points.map(p => p.accuracy)) : null;
  const worst = points.length > 0 ? Math.min(...points.map(p => p.accuracy)) : null;
  const avg = points.length > 0 ? Math.round(points.reduce((s, p) => s + p.accuracy, 0) / points.length) : null;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Sab Areas</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={days} onChange={e => setDays(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="7">7 Days</option>
            <option value="14">14 Days</option>
            <option value="30">30 Days</option>
          </select>
          <button onClick={() => setEnabled(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
            {isFetching && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Load Report
          </button>
        </div>
      </div>

      {!enabled ? (
        <div className="bg-white rounded-xl shadow-sm">
          <EmptyState text="Load Report dabayein" />
        </div>
      ) : isLoading ? (
        <div className="bg-white rounded-xl shadow-sm p-4"><LoadingSkeleton /></div>
      ) : points.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm">
          <EmptyState text="ML accuracy data available nahi" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Best Day', value: `${best}%`, icon: <TrendingUp size={20} />, color: 'text-green-600 bg-green-50' },
              { label: 'Average', value: `${avg}%`, icon: <TrendingUp size={20} />, color: 'text-blue-600 bg-blue-50' },
              { label: 'Worst Day', value: `${worst}%`, icon: <TrendingDown size={20} />, color: 'text-red-600 bg-red-50' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${c.color}`}>{c.icon}</div>
                <div>
                  <p className="text-xs text-slate-500">{c.label}</p>
                  <p className="text-xl font-bold text-slate-800">{c.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Line Chart */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h3 className="text-base font-semibold text-slate-700 mb-4">ML Accuracy Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Accuracy']} />
                {areaLines.length > 0 ? (
                  areaLines.map((al, i) => (
                    <Line key={al.areaName} type="monotone" data={al.data} dataKey="accuracy"
                      stroke={CHART_COLORS[i % CHART_COLORS.length]} name={al.areaName}
                      strokeWidth={2} dot={false} />
                  ))
                ) : (
                  <Line type="monotone" dataKey="accuracy" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
                )}
                {areaLines.length > 0 && <Legend />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

// Tab 3: Alert History
function AlertHistoryTab({ areas }: { areas: AreaOption[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(thirtyAgo);
  const [to, setTo] = useState(today);
  const [areaFilter, setAreaFilter] = useState('');
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['alerts', from, to, areaFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      if (areaFilter) params.set('areaId', areaFilter);
      const res = await api.get(`/alerts?${params}`);
      return res.data.data as AlertRecord[];
    },
    enabled,
  });

  const alerts: AlertRecord[] = data ?? [];

  // Chart data calculations
  const byDay = alerts.reduce<Record<string, number>>((acc, a) => {
    const day = a.createdAt.slice(0, 10);
    acc[day] = (acc[day] ?? 0) + 1;
    return acc;
  }, {});
  const byDayData = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date: date.slice(5), count }));

  const byType = alerts.reduce<Record<string, number>>((acc, a) => {
    acc[a.alertType] = (acc[a.alertType] ?? 0) + 1;
    return acc;
  }, {});
  const byTypeData = Object.entries(byType).map(([name, value]) => ({ name, value }));

  const byHour = alerts.reduce<Record<number, number>>((acc, a) => {
    const h = new Date(a.createdAt).getHours();
    acc[h] = (acc[h] ?? 0) + 1;
    return acc;
  }, {});
  const byHourData = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, count: byHour[h] ?? 0 }));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">From:</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">To:</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Sab Areas</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={() => setEnabled(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
            {isFetching && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Load
          </button>
        </div>
      </div>

      {!enabled ? (
        <div className="bg-white rounded-xl shadow-sm"><EmptyState text="Load dabayein" /></div>
      ) : isLoading ? (
        <div className="bg-white rounded-xl shadow-sm p-4"><LoadingSkeleton /></div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm"><EmptyState text="Is period ke liye koi alert nahi" /></div>
      ) : (
        <>
          {/* Charts grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Alerts by day */}
            <div className="bg-white rounded-xl shadow-sm p-4 col-span-2">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Alerts by Day</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byDayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Alerts by type */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Alerts by Type</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={byTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}>
                    {byTypeData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Alerts by hour */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Alerts by Hour of Day</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byHourData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={3} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill={CHART_COLORS[2]} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Raw alerts table */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <p className="text-sm font-semibold text-slate-700">Raw Alerts ({alerts.length})</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Date', 'Road', 'Type', 'Severity', 'Resolved (min)'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alerts.slice(0, 100).map((a, i) => (
                    <tr key={a.id} className={`border-b border-slate-100 hover:bg-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      <td className="px-4 py-2 text-slate-600">{new Date(a.createdAt).toLocaleDateString('en-PK')}</td>
                      <td className="px-4 py-2 text-slate-700">{a.roadName ?? '-'}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{a.alertType}</span>
                      </td>
                      <td className="px-4 py-2">
                        {a.severity && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            a.severity === 'high' ? 'bg-red-100 text-red-800' :
                            a.severity === 'medium' ? 'bg-orange-100 text-orange-800' :
                            'bg-slate-100 text-slate-600'
                          }`}>{a.severity}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{a.resolvedMinutes ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {alerts.length > 100 && (
                <div className="px-4 py-2 text-xs text-slate-400 text-center border-t border-slate-100">
                  Showing first 100 of {alerts.length} alerts
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState<'attendance' | 'ml' | 'alerts'>('attendance');

  const { data: areasData } = useQuery({
    queryKey: ['areas-list-reports'],
    queryFn: async () => {
      const res = await api.get('/admin/areas-list');
      return (res.data.data?.areas ?? res.data.data) as AreaOption[];
    },
  });

  const areas: AreaOption[] = Array.isArray(areasData) ? areasData : [];

  const tabs = [
    { key: 'attendance' as const, label: 'Attendance Summary' },
    { key: 'ml' as const, label: 'ML Accuracy' },
    { key: 'alerts' as const, label: 'Alert History' },
  ];

  return (
    <div className="p-6 min-h-screen bg-slate-50">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
        <p className="text-sm text-slate-500 mt-0.5">Analytics aur reports</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-5 border-b border-slate-200">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key
                ? 'text-white rounded-t-lg'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-t-lg'
            }`}
            style={activeTab === tab.key ? { backgroundColor: '#1A3A5C' } : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'attendance' && <AttendanceTab areas={areas} />}
      {activeTab === 'ml' && <MlAccuracyTab areas={areas} />}
      {activeTab === 'alerts' && <AlertHistoryTab areas={areas} />}
    </div>
  );
}
