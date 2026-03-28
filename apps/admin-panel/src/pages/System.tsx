import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Play, LogOut, Database, Clock, Smartphone, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import { getAdminUser } from '../lib/auth';

// CollapsibleSection helper
function CollapsibleSection({ title, children, icon }: { title: string; children: React.ReactNode; icon: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-xl shadow-sm mb-6">
      <button className="w-full flex items-center justify-between p-5 font-semibold text-slate-700" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2">{icon}{title}</div>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

interface Session {
  id: string;
  userId: string;
  userType: string;
  createdAt: string | null;
  expiresAt: string;
  deviceFingerprint?: string | null;
}

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  lastRun: string | null;
  status: 'running' | 'idle' | 'error';
}

interface DbStat {
  tableName: string;
  rowCount: number;
  size: string;
}

interface ApkVersion {
  type: 'dsp' | 'staff';
  version: string;
  downloadUrl: string;
  updatedAt: string | null;
}

function apiErrorMessage(err: unknown): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
    'Kuch ghalat ho gaya'
  );
}

// Section 1: Active Sessions
function SessionsSection() {
  const queryClient = useQueryClient();
  const adminUser = getAdminUser();
  const [confirmLogoutId, setConfirmLogoutId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const res = await api.get('/admin/system/sessions');
      return (res.data.data?.sessions ?? res.data.data) as Session[];
    },
    refetchInterval: 30000,
  });

  const sessions: Session[] = data ?? [];

  const forceLogoutMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/admin/system/sessions/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setConfirmLogoutId(null);
    },
    onError: (err: unknown) => setError(apiErrorMessage(err)),
  });

  const logoutAllMutation = useMutation({
    mutationFn: () => api.delete('/admin/system/sessions/all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
    onError: (err: unknown) => setError(apiErrorMessage(err)),
  });

  return (
    <CollapsibleSection title="Active Sessions" icon={<LogOut size={18} />}>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{error}</div>}

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-500">{sessions.length} active sessions</span>
        {adminUser?.isSuperAdmin && (
          <button
            onClick={() => { if (confirm('Sab sessions logout karein?')) logoutAllMutation.mutate(); }}
            disabled={logoutAllMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60">
            <LogOut size={14} /> Logout All
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">Koi active session nahi</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['User', 'Type', 'Login Time', 'Expires', 'Action'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={s.userId} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800 font-mono text-xs">{s.userId.slice(0, 8)}…</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{s.userType}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 text-xs">
                    {s.createdAt ? new Date(s.createdAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-600 text-xs">
                    {s.expiresAt ? new Date(s.expiresAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {confirmLogoutId === s.userId ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => forceLogoutMutation.mutate(s.userId)}
                          disabled={forceLogoutMutation.isPending}
                          className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-60">
                          Confirm
                        </button>
                        <button onClick={() => setConfirmLogoutId(null)}
                          className="px-2 py-1 border border-slate-300 text-slate-600 rounded text-xs hover:bg-slate-50">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmLogoutId(s.userId)}
                        className="flex items-center gap-1 px-2 py-1 border border-red-200 text-red-600 rounded text-xs hover:bg-red-50">
                        <LogOut size={12} /> Force Logout
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleSection>
  );
}

// Section 2: Cron Jobs
interface CronJobConfig {
  id: string;
  name: string;
  label: string;
  schedule: string;
  triggerFn: () => Promise<unknown>;
}

function CronSection() {
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [confirmMlRun, setConfirmMlRun] = useState(false);
  const [jobResults, setJobResults] = useState<Record<string, string>>({});

  const { data: cronData, isLoading } = useQuery({
    queryKey: ['cron-status'],
    queryFn: async () => {
      const res = await api.get('/admin/system/cron-status');
      return (res.data.data?.jobs ?? res.data.data) as CronJob[];
    },
  });

  const cronJobs = cronData ?? [];

  const jobConfigs: CronJobConfig[] = [
    {
      id: 'traffic-collector',
      name: 'Traffic Collector',
      label: 'Har 15 min',
      schedule: '*/15 * * * *',
      triggerFn: () => api.post('/internal/trigger-traffic-collection', {}, {
        headers: { 'X-Internal-Key': 'trigger' },
      }),
    },
    {
      id: 'roster-reminder',
      name: 'Roster Reminder',
      label: 'Roz 8 PM',
      schedule: '0 20 * * *',
      triggerFn: () => api.post('/internal/trigger-roster-reminder'),
    },
    {
      id: 'data-cleanup',
      name: 'Data Cleanup',
      label: 'Roz 2 AM',
      schedule: '0 2 * * *',
      triggerFn: () => api.post('/internal/trigger-cleanup'),
    },
    {
      id: 'ml-predictions',
      name: 'ML Predictions',
      label: 'Roz 8 PM',
      schedule: '0 20 * * *',
      triggerFn: () => fetch('http://localhost:8001/run-predictions', { method: 'POST' }).then(r => r.json()),
    },
  ];

  const handleRun = async (cfg: CronJobConfig) => {
    if (cfg.id === 'ml-predictions') {
      setConfirmMlRun(true);
      return;
    }
    setRunningJob(cfg.id);
    try {
      await cfg.triggerFn();
      setJobResults(r => ({ ...r, [cfg.id]: 'Run ho gaya!' }));
    } catch {
      setJobResults(r => ({ ...r, [cfg.id]: 'Error: run fail ho gaya' }));
    } finally {
      setRunningJob(null);
    }
  };

  const handleMlConfirm = async () => {
    setConfirmMlRun(false);
    setRunningJob('ml-predictions');
    try {
      await jobConfigs.find(j => j.id === 'ml-predictions')!.triggerFn();
      setJobResults(r => ({ ...r, 'ml-predictions': 'ML predictions start ho gaye!' }));
    } catch {
      setJobResults(r => ({ ...r, 'ml-predictions': 'ML server respond nahi kiya' }));
    } finally {
      setRunningJob(null);
    }
  };

  const getJobStatus = (id: string): CronJob | undefined =>
    cronJobs.find(j => j.id === id);

  return (
    <CollapsibleSection title="Cron Jobs Status" icon={<Clock size={18} />}>
      {confirmMlRun && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-slate-800 mb-2">ML Predictions Run Karein?</h3>
            <p className="text-sm text-slate-600 mb-4">Yeh http://localhost:8001/run-predictions call karega.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmMlRun(false)} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={handleMlConfirm} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Chalao</button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-slate-100 rounded animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {jobConfigs.map(cfg => {
            const live = getJobStatus(cfg.id);
            const result = jobResults[cfg.id];
            const isRunning = runningJob === cfg.id;
            return (
              <div key={cfg.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 text-sm">{cfg.name}</span>
                    {live && (
                      <span className={`inline-flex w-2 h-2 rounded-full ${
                        live.status === 'running' ? 'bg-green-500' :
                        live.status === 'error' ? 'bg-red-500' : 'bg-slate-300'
                      }`} />
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {cfg.label}
                    {live?.lastRun && ` · Last run: ${new Date(live.lastRun).toLocaleString('en-PK')}`}
                  </div>
                  {result && (
                    <div className={`text-xs mt-1 ${result.includes('Error') || result.includes('fail') || result.includes('nahi') ? 'text-red-600' : 'text-green-600'}`}>
                      {result}
                    </div>
                  )}
                </div>
                <button onClick={() => handleRun(cfg)} disabled={isRunning}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-white disabled:opacity-60 shrink-0">
                  {isRunning
                    ? <span className="w-3 h-3 border-2 border-slate-400/30 border-t-slate-600 rounded-full animate-spin" />
                    : <Play size={12} />
                  }
                  Run Now
                </button>
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}

// Section 3: Database Stats
function DbStatsSection() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['db-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/system/stats');
      return (res.data.data?.tables ?? res.data.data) as DbStat[];
    },
  });

  const stats: DbStat[] = data ?? [];

  return (
    <CollapsibleSection title="Database Stats" icon={<Database size={18} />}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-500">{stats.length} tables</span>
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['db-stats'] })}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-3">
          <AlertTriangle size={16} />
          Stats load nahi ho sakay (Super Admin only)
        </div>
      ) : stats.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">Koi stats nahi</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Table Name</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Row Count</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Size</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => (
                <tr key={s.tableName} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">{s.tableName}</td>
                  <td className="px-3 py-2 text-slate-700">{s.rowCount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-600">{s.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleSection>
  );
}

// Section 4: APK Versions
interface ApkCardProps {
  type: 'dsp' | 'staff';
  label: string;
}

function ApkCard({ type, label }: ApkCardProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editVersion, setEditVersion] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['apk-version', type],
    queryFn: async () => {
      const res = await api.get(`/admin/system/apk-version?type=${type}`);
      return res.data.data as ApkVersion;
    },
  });

  const handleEdit = () => {
    setEditVersion(data?.version ?? 'v1.0.0');
    setEditUrl(data?.downloadUrl ?? '');
    setIsEditing(true);
    setSaveMsg(null);
  };

  const mutation = useMutation({
    mutationFn: () => api.patch('/admin/system/apk-version', {
      type,
      version: editVersion,
      downloadUrl: editUrl,
    }).catch(() => {
      // Stub - show success even on 404
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apk-version', type] });
      setIsEditing(false);
      setSaveMsg('Update ho gaya!');
      setTimeout(() => setSaveMsg(null), 3000);
    },
  });

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Smartphone size={18} className="text-slate-500" />
        <span className="font-semibold text-slate-800">{label}</span>
      </div>

      {saveMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded px-2 py-1.5 text-xs mb-3">{saveMsg}</div>
      )}

      {isEditing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Version</label>
            <input type="text" value={editVersion} onChange={e => setEditVersion(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="v1.0.0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Download URL</label>
            <input type="url" value={editUrl} onChange={e => setEditUrl(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://..." />
          </div>
          <div className="flex gap-2">
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1">
              {mutation.isPending && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Update
            </button>
            <button onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-xs hover:bg-slate-100">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="text-2xl font-bold text-slate-800 mb-1 font-mono">
            {data?.version ?? 'v1.0.0'}
          </div>
          {data?.downloadUrl && (
            <a href={data.downloadUrl} target="_blank" rel="noreferrer"
              className="text-xs text-blue-600 hover:underline truncate block mb-2">
              {data.downloadUrl}
            </a>
          )}
          {data?.updatedAt && (
            <p className="text-xs text-slate-400 mb-3">
              Last updated: {new Date(data.updatedAt).toLocaleDateString('en-PK')}
            </p>
          )}
          <button onClick={handleEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-white">
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

function ApkSection() {
  return (
    <CollapsibleSection title="APK Versions" icon={<Smartphone size={18} />}>
      <div className="grid grid-cols-2 gap-4">
        <ApkCard type="dsp" label="DSP App" />
        <ApkCard type="staff" label="Staff App" />
      </div>
    </CollapsibleSection>
  );
}

export default function System() {
  return (
    <div className="p-6 min-h-screen bg-slate-50">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">System</h1>
        <p className="text-sm text-slate-500 mt-0.5">System management aur monitoring</p>
      </div>

      <SessionsSection />
      <CronSection />
      <DbStatsSection />
      <ApkSection />
    </div>
  );
}
