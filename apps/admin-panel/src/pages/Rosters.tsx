import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Calendar, FileDown, X } from 'lucide-react';
import api from '../lib/api';

interface RosterCell {
  sectorId: string;
  sectorName: string;
  rosterId: string | null;
  status: 'published' | 'draft' | null;
  assignedCount: number;
  totalCount: number;
}

interface DspRosterRow {
  dspId: string;
  dspName: string;
  sectors: RosterCell[];
}

interface RosterDetail {
  id: string;
  date: string;
  status: 'published' | 'draft';
  areaName: string;
  sectorName: string;
  staffList: { badgeId: string; fullName: string; rank: string | null }[];
}

interface DspOption {
  id: string;
  fullName: string;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function StatusBadge({ status }: { status: 'published' | 'draft' | null }) {
  if (status === 'published') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Published</span>
  );
  if (status === 'draft') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Draft</span>
  );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">Not Created</span>
  );
}

// Detail side panel
function DetailPanel({
  cell,
  date,
  onClose,
}: {
  cell: { rosterId: string | null; sectorName: string; dspName: string; status: 'published' | 'draft' | null };
  date: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['roster-detail', cell.rosterId],
    queryFn: async () => {
      const res = await api.get(`/roster/${cell.rosterId}`);
      return res.data.data as RosterDetail;
    },
    enabled: !!cell.rosterId,
  });

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[40%] min-w-80 bg-white shadow-2xl flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">Roster Detail</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3 mb-4">
            <div className="flex gap-2 text-sm">
              <span className="text-slate-500 w-20 shrink-0">DSP:</span>
              <span className="font-medium text-slate-800">{cell.dspName}</span>
            </div>
            <div className="flex gap-2 text-sm">
              <span className="text-slate-500 w-20 shrink-0">Sector:</span>
              <span className="font-medium text-slate-800">{cell.sectorName}</span>
            </div>
            <div className="flex gap-2 text-sm">
              <span className="text-slate-500 w-20 shrink-0">Date:</span>
              <span className="font-medium text-slate-800">{date}</span>
            </div>
            <div className="flex gap-2 text-sm items-center">
              <span className="text-slate-500 w-20 shrink-0">Status:</span>
              <StatusBadge status={cell.status} />
            </div>
            {cell.rosterId && (
              <div className="flex gap-2 text-sm">
                <span className="text-slate-500 w-20 shrink-0">Roster ID:</span>
                <span className="font-mono text-xs text-slate-600">{cell.rosterId}</span>
              </div>
            )}
          </div>

          {!cell.rosterId ? (
            <div className="bg-slate-50 rounded-lg p-4 text-center text-slate-400 text-sm border border-dashed border-slate-200">
              Yeh date ke liye koi roster nahi bana
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-4">
              <span className="w-6 h-6 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : data?.staffList && data.staffList.length > 0 ? (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Staff List ({data.staffList.length})</p>
              <div className="space-y-1.5">
                {data.staffList.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 rounded px-3 py-2">
                    <span className="font-mono text-xs text-slate-400">{s.badgeId}</span>
                    <span className="font-medium text-slate-700">{s.fullName}</span>
                    {s.rank && <span className="text-xs text-slate-400">({s.rank})</span>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-lg p-4 text-center text-slate-400 text-sm">
              Staff list available nahi
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={() => {
              if (!cell.rosterId) { alert('PDF ke liye roster hona chahiye'); return; }
              alert('PDF download coming soon');
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50"
            disabled={!cell.rosterId}
          >
            <FileDown size={16} /> PDF Download
          </button>
        </div>
      </div>
    </div>
  );
}

// Calendar heatmap
function CalendarHeatmap({
  selectedDate,
  onDayClick,
}: {
  selectedDate: string;
  onDayClick: (date: string) => void;
}) {
  const today = new Date();
  const days: Date[] = [];
  for (let i = 29; i >= 0; i--) {
    days.push(addDays(today, -i));
  }

  // Pad start so Mon is first col
  const firstDay = days[0];
  const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon
  const padded: (Date | null)[] = [
    ...Array(startDow).fill(null),
    ...days,
  ];

  const dowLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <h2 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
        <Calendar size={16} /> Pichle 30 Din
      </h2>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dowLabels.map(d => (
          <div key={d} className="text-xs text-slate-400 text-center font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {padded.map((day, i) => {
          if (!day) return <div key={`pad-${i}`} />;
          const ds = formatDate(day);
          const isFuture = day > today;
          const isSelected = ds === selectedDate;

          // Determine color (mock - no real data per day here)
          // In real usage you'd check roster data for that day
          const colorClass = isFuture
            ? 'bg-white border border-slate-200'
            : isSelected
              ? 'bg-[#1A3A5C] text-white'
              : 'bg-green-200 hover:bg-green-300';

          return (
            <button
              key={ds}
              onClick={() => !isFuture && onDayClick(ds)}
              disabled={isFuture}
              title={ds}
              className={`aspect-square rounded flex items-center justify-center text-xs transition-colors disabled:cursor-default ${colorClass}`}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-300 rounded" /> Published</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-300 rounded" /> Partial</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-slate-200 rounded" /> None</span>
      </div>
    </div>
  );
}

export default function Rosters() {
  const today = formatDate(new Date());
  const [date, setDate] = useState(today);
  const [dspFilter, setDspFilter] = useState('');
  const [detailCell, setDetailCell] = useState<{
    rosterId: string | null;
    sectorName: string;
    dspName: string;
    status: 'published' | 'draft' | null;
  } | null>(null);

  const { data: rostersData, isLoading, isError } = useQuery({
    queryKey: ['rosters', date, dspFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ date });
      if (dspFilter) params.set('dspId', dspFilter);
      const res = await api.get(`/admin/rosters?${params}`);
      return res.data.data as { rows: DspRosterRow[]; allSectors: { id: string; name: string }[] };
    },
  });

  const { data: dspListData } = useQuery({
    queryKey: ['dsp-list-rosters'],
    queryFn: async () => {
      const res = await api.get('/admin/dsp-users?limit=100');
      return (res.data.data?.users ?? res.data.data) as DspOption[];
    },
  });

  const rows: DspRosterRow[] = rostersData?.rows ?? [];
  const allSectors = rostersData?.allSectors ?? [];
  const dspList: DspOption[] = dspListData ?? [];

  // Derive unique sector columns from rows
  const sectorColumns = allSectors.length > 0
    ? allSectors
    : rows.length > 0
      ? (rows[0]?.sectors ?? []).map(s => ({ id: s.sectorId, name: s.sectorName }))
      : [];

  return (
    <div className="p-6 min-h-screen bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Rosters</h1>
          <p className="text-sm text-slate-500 mt-0.5">Daily duty roster overview</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-slate-400" />
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              max={today}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setDate(formatDate(addDays(new Date(date), -1)))}
              className="p-1.5 rounded border border-slate-300 hover:bg-slate-50">
              <ChevronLeft size={16} className="text-slate-500" />
            </button>
            <button onClick={() => setDate(formatDate(addDays(new Date(date), 1)))}
              disabled={date >= today}
              className="p-1.5 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-40">
              <ChevronRight size={16} className="text-slate-500" />
            </button>
          </div>
          <select value={dspFilter} onChange={e => setDspFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Sab DSPs</option>
            {dspList.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
          </select>
        </div>
      </div>

      {/* Roster Grid */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <span className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-red-600 text-sm">Data load nahi ho saka.</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Calendar size={40} className="mb-2 opacity-30" />
            <p className="text-sm">Is date ke liye koi roster nahi</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 min-w-40">DSP Name</th>
                  {sectorColumns.map(s => (
                    <th key={s.id} className="px-4 py-3 text-left font-semibold text-slate-600 min-w-36">{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.dspId} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.dspName}</td>
                    {sectorColumns.map(sc => {
                      const cell = row.sectors.find(s => s.sectorId === sc.id);
                      return (
                        <td key={sc.id} className="px-4 py-3">
                          {cell ? (
                            <button
                              onClick={() => setDetailCell({ rosterId: cell.rosterId, sectorName: cell.sectorName, dspName: row.dspName, status: cell.status })}
                              className="text-left group"
                            >
                              <StatusBadge status={cell.status} />
                              {(cell.assignedCount > 0 || cell.totalCount > 0) && (
                                <div className="text-xs text-slate-400 mt-1">
                                  {cell.assignedCount}/{cell.totalCount}
                                </div>
                              )}
                            </button>
                          ) : (
                            <StatusBadge status={null} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Calendar Heatmap */}
      <CalendarHeatmap selectedDate={date} onDayClick={setDate} />

      {/* Detail Panel */}
      {detailCell && (
        <DetailPanel
          cell={detailCell}
          date={date}
          onClose={() => setDetailCell(null)}
        />
      )}
    </div>
  );
}
