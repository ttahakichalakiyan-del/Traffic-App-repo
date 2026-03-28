import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getPaginationRowModel, flexRender,
  type SortingState, type ColumnDef
} from '@tanstack/react-table';
import { Plus, Search, Pencil, KeyRound, UserX, Copy, Check, X } from 'lucide-react';
import api from '../lib/api';

interface DspUser {
  id: string;
  username: string;
  fullName: string;
  badgeNumber: string | null;
  rank: string | null;
  designation: string | null;
  phone: string | null;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

interface CreateDspUserForm {
  username: string;
  fullName: string;
  badgeNumber: string;
  rank: string;
  designation: string;
  phone: string;
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

// Temp Password Modal
function TempPasswordModal({ password, onClose }: { password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800">Temporary Password</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-slate-600 mb-3">Yeh password sirf abhi dikha raha hai</p>

        <div className="relative">
          <div className="font-mono bg-slate-100 p-3 rounded-lg text-lg tracking-widest text-center text-slate-800 border border-slate-200">
            {password}
          </div>
          <button
            onClick={handleCopy}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-slate-200 transition-colors"
            title="Copy"
          >
            {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} className="text-slate-500" />}
          </button>
        </div>

        <p className="text-sm text-green-600 mt-3 flex items-center gap-1">
          <span>💬</span> WhatsApp par bhejein
        </p>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-white rounded-lg font-medium"
            style={{ backgroundColor: '#1A3A5C' }}
          >
            Theek Hai
          </button>
        </div>
      </div>
    </div>
  );
}

// Create Modal
function CreateModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (tempPassword: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateDspUserForm>({
    username: '',
    fullName: '',
    badgeNumber: '',
    rank: '',
    designation: '',
    phone: '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: CreateDspUserForm) => api.post('/admin/dsp-users', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['dsp-users'] });
      const tempPassword = res.data?.data?.tempPassword ?? res.data?.tempPassword ?? '(check server)';
      onSuccess(tempPassword);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Kuch ghalat ho gaya';
      setError(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.username.trim() || !form.fullName.trim()) {
      setError('Username aur Full Name zaruri hain');
      return;
    }
    mutation.mutate(form);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold text-slate-800">Naya DSP Banao</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Username *</label>
            <input
              type="text"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. dsp.kareem"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
            <input
              type="text"
              value={form.fullName}
              onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Abdul Kareem"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Badge Number</label>
            <input
              type="text"
              value={form.badgeNumber}
              onChange={e => setForm(f => ({ ...f, badgeNumber: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. DSP-001"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Rank</label>
            <select
              value={form.rank}
              onChange={e => setForm(f => ({ ...f, rank: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Rank chunein --</option>
              <option value="DSP">DSP</option>
              <option value="Inspector">Inspector</option>
              <option value="Sub-Inspector">Sub-Inspector</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
            <input
              type="text"
              value={form.designation}
              onChange={e => setForm(f => ({ ...f, designation: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Traffic Incharge"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 03001234567"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50"
            >
              Baaz Aao
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-2"
              style={{ backgroundColor: '#1A3A5C' }}
            >
              {mutation.isPending && (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              Banao
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Reset Password Modal
function ResetPasswordModal({
  user,
  onClose,
  onSuccess,
}: {
  user: DspUser;
  onClose: () => void;
  onSuccess: (tempPassword: string) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.post(`/admin/dsp-users/${user.id}/reset-password`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['dsp-users'] });
      const tempPassword = res.data?.data?.tempPassword ?? res.data?.tempPassword ?? '(check server)';
      onSuccess(tempPassword);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Reset fail ho gaya';
      setError(msg);
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800">Password Reset</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">
            {error}
          </div>
        )}

        <p className="text-slate-700 mb-2">
          DSP <span className="font-semibold">{user.fullName}</span> ka password reset karein?
        </p>
        <p className="text-sm text-slate-500 mb-6">Naya temporary password generate hoga.</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-2 hover:bg-blue-700"
          >
            {mutation.isPending && (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            Reset Karein
          </button>
        </div>
      </div>
    </div>
  );
}

// Deactivate Confirm Modal
function DeactivateModal({
  user,
  onClose,
}: {
  user: DspUser;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.delete(`/admin/dsp-users/${user.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dsp-users'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Deactivate fail ho gaya';
      setError(msg);
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800">DSP Deactivate Karein</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">
            {error}
          </div>
        )}

        <p className="text-slate-700 mb-2">
          DSP <span className="font-semibold">{user.fullName}</span> ko deactivate karna chahte hain?
        </p>
        <p className="text-sm text-orange-600 mb-6">Yeh unhe login nahi karne dega.</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-2 hover:bg-red-700"
          >
            {mutation.isPending && (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            Deactivate
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DspUsers() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [resetUser, setResetUser] = useState<DspUser | null>(null);
  const [deactivateUser, setDeactivateUser] = useState<DspUser | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dsp-users', search, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await api.get(`/admin/dsp-users?${params}`);
      return res.data.data as { users: DspUser[]; total: number; totalPages: number };
    },
  });

  const users: DspUser[] = data?.users ?? [];
  const totalPages = data?.totalPages ?? 1;

  const columns: ColumnDef<DspUser>[] = [
    {
      accessorKey: 'badgeNumber',
      header: 'Badge #',
      cell: ({ getValue }) => <span className="font-mono text-sm">{(getValue() as string | null) ?? '-'}</span>,
    },
    {
      accessorKey: 'fullName',
      header: 'Full Name',
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-slate-800">{row.original.fullName}</div>
          <div className="text-xs text-slate-400">{row.original.username}</div>
        </div>
      ),
    },
    {
      accessorKey: 'rank',
      header: 'Rank',
      cell: ({ getValue }) => (getValue() as string | null) ?? '-',
    },
    {
      accessorKey: 'designation',
      header: 'Designation',
      cell: ({ getValue }) => (getValue() as string | null) ?? '-',
    },
    {
      accessorKey: 'lastLogin',
      header: 'Last Login',
      cell: ({ getValue }) => (
        <span className="text-sm text-slate-500">
          {formatRelativeTime(getValue() as string | null)}
        </span>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ getValue }) => {
        const active = getValue() as boolean;
        return (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {active ? 'Active' : 'Inactive'}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <button
            title="Edit"
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors"
            onClick={() => alert('Edit coming soon')}
          >
            <Pencil size={15} />
          </button>
          <button
            title="Reset Password"
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-orange-600 transition-colors"
            onClick={() => setResetUser(row.original)}
          >
            <KeyRound size={15} />
          </button>
          <button
            title="Deactivate"
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600 transition-colors"
            onClick={() => setDeactivateUser(row.original)}
            disabled={!row.original.isActive}
          >
            <UserX size={15} />
          </button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: users,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  const handleCreateSuccess = useCallback((pw: string) => {
    setShowCreateModal(false);
    setTempPassword(pw);
  }, []);

  const handleResetSuccess = useCallback((pw: string) => {
    setResetUser(null);
    setTempPassword(pw);
  }, []);

  const statusTabs = [
    { key: 'all' as const, label: 'Sab' },
    { key: 'active' as const, label: 'Active' },
    { key: 'inactive' as const, label: 'Inactive' },
  ];

  return (
    <div className="p-6 min-h-screen bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">DSP Users</h1>
          <p className="text-sm text-slate-500 mt-0.5">DSP officers ka management</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#1A3A5C' }}
        >
          <Plus size={16} />
          DSP Banao
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Naam ya badge se dhundein..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {statusTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setStatusFilter(tab.key); setPage(1); }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  statusFilter === tab.key
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
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
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <UserX size={40} className="mb-2 opacity-30" />
            <p className="text-sm">Koi DSP nahi mila</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map(hg => (
                    <tr key={hg.id} className="bg-slate-50 border-b border-slate-200">
                      {hg.headers.map(header => (
                        <th
                          key={header.id}
                          className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer select-none"
                          onClick={header.column.getToggleSortingHandler()}
                        >
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
                    <tr
                      key={row.id}
                      className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                        i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                      }`}
                    >
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

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <span className="text-sm text-slate-500">
                Page {page} of {totalPages} &mdash; {data?.total ?? 0} total
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm disabled:opacity-40 hover:bg-slate-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm disabled:opacity-40 hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {tempPassword && (
        <TempPasswordModal
          password={tempPassword}
          onClose={() => setTempPassword(null)}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSuccess={handleResetSuccess}
        />
      )}

      {deactivateUser && (
        <DeactivateModal
          user={deactivateUser}
          onClose={() => setDeactivateUser(null)}
        />
      )}
    </div>
  );
}
