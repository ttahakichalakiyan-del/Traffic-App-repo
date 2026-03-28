import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getPaginationRowModel, flexRender,
  type SortingState, type ColumnDef
} from '@tanstack/react-table';
import { Plus, Upload, Download, Search, Pencil, KeyRound, UserX, X, FileText } from 'lucide-react';
import api from '../lib/api';

interface StaffMember {
  id: string;
  badgeId: string;
  fullName: string;
  rank: string | null;
  designation: string | null;
  areaId: string | null;
  areaName: string | null;
  sectorId: string | null;
  sectorName: string | null;
  phone: string | null;
  isActive: boolean;
  isOnDuty: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

interface AreaOption {
  id: string;
  name: string;
}

interface SectorOption {
  id: string;
  name: string;
}

interface CreateStaffForm {
  badgeId: string;
  fullName: string;
  rank: string;
  designation: string;
  phone: string;
  areaId: string;
  sectorId: string;
  pin: string;
}

interface StaffListResponse {
  staff: StaffMember[];
  total: number;
  totalPages: number;
  stats: { total: number; active: number; onDuty: number; inactive: number };
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Kabhi nahi';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return 'Abhi abhi';
  if (mins < 60) return `${mins} min pehle`;
  if (hours < 24) return `${hours} ghante pehle`;
  return `${days} din pehle`;
}

function apiErrorMessage(err: unknown): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
    'Kuch ghalat ho gaya'
  );
}

function PinModal({ pin, onClose }: { pin: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800">Staff PIN</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <p className="text-sm text-slate-600 mb-3">Naya PIN hai:</p>
        <div className="font-mono bg-slate-100 p-4 rounded-lg text-2xl tracking-[0.5em] text-center text-slate-800 border border-slate-200">
          {pin}
        </div>
        <p className="text-sm text-orange-600 mt-3">Yeh PIN sirf abhi dikha raha hai. Staff ko bata dein.</p>
        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 text-white rounded-lg font-medium" style={{ backgroundColor: '#1A3A5C' }}>
            Theek Hai
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateStaffModal({
  areas,
  onClose,
  onSuccess,
}: {
  areas: AreaOption[];
  onClose: () => void;
  onSuccess: (pin: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateStaffForm>({
    badgeId: '', fullName: '', rank: '', designation: '',
    phone: '', areaId: '', sectorId: '', pin: '',
  });
  const [error, setError] = useState<string | null>(null);

  const { data: sectorsData } = useQuery({
    queryKey: ['sectors-for-create', form.areaId],
    queryFn: async () => {
      const res = await api.get(`/admin/areas/${form.areaId}/sectors`);
      return (res.data.data?.sectors ?? res.data.data) as SectorOption[];
    },
    enabled: !!form.areaId,
  });

  const sectors: SectorOption[] = sectorsData ?? [];

  const mutation = useMutation({
    mutationFn: (data: CreateStaffForm) => api.post('/admin/staff', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      const pin = res.data?.data?.newPin ?? res.data?.data?.pin ?? res.data?.pin ?? '(check server)';
      onSuccess(pin as string);
    },
    onError: (err: unknown) => setError(apiErrorMessage(err)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.badgeId.trim() || !form.fullName.trim()) {
      setError('Badge ID aur Full Name zaruri hain');
      return;
    }
    if (form.pin && (form.pin.length !== 4 || !/^\d{4}$/.test(form.pin))) {
      setError('PIN 4 digits ka hona chahiye');
      return;
    }
    mutation.mutate(form);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <h3 className="text-lg font-semibold text-slate-800">Naya Staff Member Banao</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Badge ID *</label>
              <input type="text" value={form.badgeId} onChange={e => setForm(f => ({ ...f, badgeId: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. TRF-001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
              <input type="text" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Muhammad Ali" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rank</label>
              <select value={form.rank} onChange={e => setForm(f => ({ ...f, rank: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Rank chunein --</option>
                <option value="Constable">Constable</option>
                <option value="Head Constable">Head Constable</option>
                <option value="ASI">ASI</option>
                <option value="SI">SI</option>
                <option value="Inspector">Inspector</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="03001234567" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
            <input type="text" value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Traffic Warden" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Area</label>
              <select value={form.areaId} onChange={e => setForm(f => ({ ...f, areaId: e.target.value, sectorId: '' }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Area chunein --</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sector</label>
              <select value={form.sectorId} onChange={e => setForm(f => ({ ...f, sectorId: e.target.value }))}
                disabled={!form.areaId}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400">
                <option value="">-- Sector chunein --</option>
                {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">PIN (4 digits, optional)</label>
            <input type="text" value={form.pin}
              onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Auto-generate hoga agar khali ho" maxLength={4} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50">Baaz Aao</button>
            <button type="submit" disabled={mutation.isPending}
              className="px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-2"
              style={{ backgroundColor: '#1A3A5C' }}>
              {mutation.isPending && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Banao
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResetPinModal({ staff, onClose, onSuccess }: {
  staff: StaffMember;
  onClose: () => void;
  onSuccess: (pin: string) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => api.post(`/admin/staff/${staff.id}/reset-pin`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      const pin = res.data?.data?.newPin ?? res.data?.data?.pin ?? res.data?.pin ?? '(check server)';
      onSuccess(pin as string);
    },
    onError: (err: unknown) => setError(apiErrorMessage(err)),
  });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800">PIN Reset Karein</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">{error}</div>}
        <p className="text-slate-700 mb-6"><span className="font-semibold">{staff.fullName}</span> ({staff.badgeId}) ka PIN reset karein?</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-2 hover:bg-blue-700">
            {mutation.isPending && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Reset Karein
          </button>
        </div>
      </div>
    </div>
  );
}

function CsvImportModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [file, setFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parseCSV = (text: string): string[][] =>
    text.trim().split('\n').map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.csv')) { setError('Sirf .csv file allowed hai'); return; }
    setFile(f);
    setStep(2);
    setError(null);
  };

  const handlePreview = async () => {
    if (!file) return;
    const text = await file.text();
    setCsvRows(parseCSV(text));
    setStep(3);
  };

  const mutation = useMutation({
    mutationFn: (rows: string[][]) => {
      const headers = rows[0] ?? [];
      const data = rows.slice(1).map(row => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
        return obj;
      });
      return api.post('/admin/staff/bulk-import', { data });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      const result = (res.data?.data ?? { created: 0, updated: 0, failed: 0 }) as { created: number; updated: number; failed: number };
      setImportResult(result);
      setStep(5);
    },
    onError: (err: unknown) => setError(apiErrorMessage(err)),
  });

  const headers = csvRows[0] ?? [];
  const previewRows = csvRows.slice(1, 11);
  const totalRows = Math.max(0, csvRows.length - 1);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">CSV Import</h3>
            <div className="flex items-center gap-1 mt-1">
              {([1, 2, 3, 4, 5] as const).map(s => (
                <div key={s} className={`h-1.5 w-8 rounded-full ${step >= s ? 'bg-blue-500' : 'bg-slate-200'}`} />
              ))}
              <span className="text-xs text-slate-400 ml-2">Step {step} of 5</span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">{error}</div>}

          {step === 1 && (
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-slate-400'}`}
            >
              <FileText size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-slate-600 font-medium mb-1">CSV file yahan drop karein</p>
              <p className="text-sm text-slate-400 mb-4">ya</p>
              <button onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                File Chunein
              </button>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <p className="text-xs text-slate-400 mt-4">Format: badgeId, fullName, rank, designation, phone, areaId, sectorId</p>
            </div>
          )}

          {step === 2 && file && (
            <div className="text-center py-8">
              <FileText size={48} className="mx-auto mb-4 text-blue-500" />
              <p className="font-semibold text-slate-800">{file.name}</p>
              <p className="text-sm text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
              <button onClick={handlePreview}
                className="mt-6 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
                Preview Karein
              </button>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-slate-700">Preview (first 10 rows of {totalRows})</p>
                <span className="text-sm text-green-600">{totalRows} rows</span>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      {headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, ri) => (
                      <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 text-slate-600 border-b border-slate-100">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setStep(1)} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50">Wapas</button>
                <button onClick={() => setStep(4)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Aage Barho</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center py-8">
              <p className="text-lg font-semibold text-slate-800 mb-2">Confirm Import</p>
              <p className="text-slate-500 mb-1">{totalRows} staff members import honge</p>
              <p className="text-sm text-orange-600 mb-8">Existing badge IDs update ho jayenge</p>
              <div className="flex justify-center gap-3">
                <button onClick={() => setStep(3)} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50">Wapas</button>
                <button onClick={() => mutation.mutate(csvRows)} disabled={mutation.isPending}
                  className="px-6 py-2.5 text-white rounded-lg font-medium disabled:opacity-60 flex items-center gap-2"
                  style={{ backgroundColor: '#1A3A5C' }}>
                  {mutation.isPending && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Import Karein
                </button>
              </div>
            </div>
          )}

          {step === 5 && importResult && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
              <p className="text-lg font-semibold text-slate-800 mb-6">Import Complete!</p>
              <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto mb-8">
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-700">{importResult.created}</div>
                  <div className="text-xs text-green-600">Banaye</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-blue-700">{importResult.updated}</div>
                  <div className="text-xs text-blue-600">Update</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-red-700">{importResult.failed}</div>
                  <div className="text-xs text-red-600">Failed</div>
                </div>
              </div>
              <button onClick={onClose} className="px-6 py-2.5 text-white rounded-lg font-medium" style={{ backgroundColor: '#1A3A5C' }}>
                Theek Hai
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Staff() {
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'on-duty'>('all');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [newPin, setNewPin] = useState<string | null>(null);
  const [resetStaff, setResetStaff] = useState<StaffMember | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['staff', search, areaFilter, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (areaFilter) params.set('areaId', areaFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await api.get(`/admin/staff?${params}`);
      return res.data.data as StaffListResponse;
    },
  });

  const { data: areasData } = useQuery({
    queryKey: ['areas-list'],
    queryFn: async () => {
      const res = await api.get('/admin/areas-list');
      return (res.data.data?.areas ?? res.data.data) as AreaOption[];
    },
  });

  const staff: StaffMember[] = data?.staff ?? [];
  const totalPages = data?.totalPages ?? 1;
  const stats = data?.stats ?? { total: 0, active: 0, onDuty: 0, inactive: 0 };
  const areas: AreaOption[] = areasData ?? [];

  const handleExport = useCallback(async () => {
    try {
      const res = await api.get('/admin/staff?limit=10000');
      const allStaff: StaffMember[] = res.data?.data?.staff ?? [];
      const headers = ['badgeId', 'fullName', 'rank', 'designation', 'areaName', 'sectorName', 'phone', 'isActive', 'isOnDuty', 'lastSeenAt'];
      const rows = allStaff.map(s => headers.map(h => String((s as unknown as Record<string, unknown>)[h] ?? '')));
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `staff-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export fail ho gaya');
    }
  }, []);

  const columns: ColumnDef<StaffMember>[] = [
    {
      accessorKey: 'badgeId', header: 'Badge ID',
      cell: ({ getValue }) => <span className="font-mono text-sm">{getValue() as string}</span>,
    },
    {
      accessorKey: 'fullName', header: 'Name',
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-slate-800">{row.original.fullName}</div>
          {row.original.designation && <div className="text-xs text-slate-400">{row.original.designation}</div>}
        </div>
      ),
    },
    { accessorKey: 'rank', header: 'Rank', cell: ({ getValue }) => (getValue() as string | null) ?? '-' },
    { accessorKey: 'areaName', header: 'Area', cell: ({ getValue }) => (getValue() as string | null) ?? '-' },
    { accessorKey: 'sectorName', header: 'Sector', cell: ({ getValue }) => (getValue() as string | null) ?? '-' },
    {
      accessorKey: 'isActive', header: 'Status',
      cell: ({ getValue }) => {
        const active = getValue() as boolean;
        return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{active ? 'Active' : 'Inactive'}</span>;
      },
    },
    {
      accessorKey: 'isOnDuty', header: 'On Duty',
      cell: ({ getValue }) => {
        const onDuty = getValue() as boolean;
        return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${onDuty ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}`}>{onDuty ? 'On Duty' : 'Off'}</span>;
      },
    },
    {
      accessorKey: 'lastSeenAt', header: 'Last Seen',
      cell: ({ getValue }) => <span className="text-sm text-slate-500">{formatRelativeTime(getValue() as string | null)}</span>,
    },
    {
      id: 'actions', header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <button title="Edit" className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600" onClick={() => alert('Edit coming soon')}>
            <Pencil size={15} />
          </button>
          <button title="Reset PIN" className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-orange-600" onClick={() => setResetStaff(row.original)}>
            <KeyRound size={15} />
          </button>
          <button title="Deactivate" className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600" onClick={() => alert('Deactivate coming soon')}>
            <UserX size={15} />
          </button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: staff,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  const statusTabs: { key: 'all' | 'active' | 'inactive' | 'on-duty'; label: string }[] = [
    { key: 'all', label: 'Sab' },
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'on-duty', label: 'On Duty' },
  ];

  return (
    <div className="p-6 min-h-screen bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Staff Members</h1>
          <p className="text-sm text-slate-500 mt-0.5">Traffic staff ka management</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50">
            <Upload size={15} /> CSV Import
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50">
            <Download size={15} /> CSV Export
          </button>
          <button onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg font-medium text-sm hover:opacity-90"
            style={{ backgroundColor: '#1A3A5C' }}>
            <Plus size={16} /> Staff Banao
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {[
          { label: 'Total', value: stats.total, color: 'bg-slate-100 text-slate-700' },
          { label: 'Active', value: stats.active, color: 'bg-green-100 text-green-700' },
          { label: 'On Duty', value: stats.onDuty, color: 'bg-blue-100 text-blue-700' },
          { label: 'Inactive', value: stats.inactive, color: 'bg-red-100 text-red-700' },
        ].map(s => (
          <div key={s.label} className={`px-4 py-2 rounded-full text-sm font-medium ${s.color}`}>
            {s.label}: {s.value}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Naam ya badge se dhundein..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <select value={areaFilter} onChange={e => { setAreaFilter(e.target.value); setPage(1); }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Sab Areas</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {statusTabs.map(tab => (
              <button key={tab.key} onClick={() => { setStatusFilter(tab.key); setPage(1); }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${statusFilter === tab.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <span className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-red-600 text-sm">Data load nahi ho saka. Dobara koshish karein.</p>
          </div>
        ) : staff.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <UserX size={40} className="mb-2 opacity-30" />
            <p className="text-sm">Koi staff member nahi mila</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map(hg => (
                    <tr key={hg.id} className="bg-slate-50 border-b border-slate-200">
                      {hg.headers.map(header => (
                        <th key={header.id} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer select-none"
                          onClick={header.column.getToggleSortingHandler()}>
                          <div className="flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getIsSorted() === 'asc' && ' ↑'}
                            {header.column.getIsSorted() === 'desc' && ' ↓'}
                          </div>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row, i) => (
                    <tr key={row.id}
                      className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="px-4 py-3 text-slate-700">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <span className="text-sm text-slate-500">Page {page} of {totalPages} &mdash; {data?.total ?? 0} total</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm disabled:opacity-40 hover:bg-slate-50">Previous</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm disabled:opacity-40 hover:bg-slate-50">Next</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateStaffModal
          areas={areas}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(pin) => { setShowCreateModal(false); setNewPin(pin); }}
        />
      )}
      {newPin && <PinModal pin={newPin} onClose={() => setNewPin(null)} />}
      {resetStaff && (
        <ResetPinModal
          staff={resetStaff}
          onClose={() => setResetStaff(null)}
          onSuccess={(pin) => { setResetStaff(null); setNewPin(pin); }}
        />
      )}
      {showImportModal && <CsvImportModal onClose={() => setShowImportModal(false)} />}
    </div>
  );
}
