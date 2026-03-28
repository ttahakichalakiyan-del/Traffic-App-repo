import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Save, Pencil } from 'lucide-react';
import api from '../lib/api';

interface Area {
  id: string;
  name: string;
  colorHex: string;
  isActive: boolean;
  dspUserId: string | null;
  dspName: string | null;
  sectorCount: number;
  boundaryGeoJson: string | null;
}

interface Sector {
  id: string;
  name: string;
  colorHex: string;
  displayOrder: number;
  isActive: boolean;
}

interface DspOption {
  id: string;
  fullName: string;
  badgeNumber: string | null;
}

function apiErrorMessage(err: unknown): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
    'Kuch ghalat ho gaya'
  );
}

// Create Area Modal
function CreateAreaModal({
  dspList,
  onClose,
}: {
  dspList: DspOption[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    dspUserId: '',
    colorHex: '#1A3A5C',
    geoJson: '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.post('/admin/areas', { ...form, dspUserId: form.dspUserId || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['areas'] });
      onClose();
    },
    onError: (err: unknown) => setError(apiErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <h3 className="text-lg font-semibold text-slate-800">Naya Area Banao</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Area Name *</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Saddar" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">DSP Assign</label>
              <select value={form.dspUserId} onChange={e => setForm(f => ({ ...f, dspUserId: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- DSP chunein --</option>
                {dspList.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}{d.badgeNumber ? ` (${d.badgeNumber})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.colorHex} onChange={e => setForm(f => ({ ...f, colorHex: e.target.value }))}
                  className="w-10 h-10 rounded cursor-pointer border border-slate-300" />
                <span className="text-sm font-mono text-slate-600">{form.colorHex}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">
                Area ki Hadd <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <a href="https://geojson.io" target="_blank" rel="noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                🗺️ Map pe draw karein
              </a>
            </div>
            <p className="text-xs text-slate-400 mb-2">
              geojson.io website pe apne area ki boundary draw karein, phir wahan ka code copy kar ke yahan paste karein
            </p>
            <textarea value={form.geoJson} onChange={e => setForm(f => ({ ...f, geoJson: e.target.value }))}
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder='geojson.io se copy kiya hua code yahan paste karein...' />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50">Baaz Aao</button>
            <button onClick={() => { if (!form.name.trim()) { setError('Area name zaruri hai'); return; } mutation.mutate(); }}
              disabled={mutation.isPending}
              className="px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-2"
              style={{ backgroundColor: '#1A3A5C' }}>
              {mutation.isPending && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Banao
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Sector row
function SectorRow({ sector, onSave }: { sector: Sector; onSave: (id: string, name: string, colorHex: string) => void }) {
  const [name, setName] = useState(sector.name);
  const [color, setColor] = useState(sector.colorHex);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(sector.id, name, color);
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
      <input type="color" value={color} onChange={e => setColor(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer border border-slate-200 shrink-0" />
      <input type="text" value={name} onChange={e => setName(e.target.value)}
        className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button onClick={handleSave} disabled={saving}
        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-60 flex items-center gap-1 hover:bg-blue-700 shrink-0">
        {saving ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={12} />}
        Save
      </button>
    </div>
  );
}

export default function Areas() {
  const queryClient = useQueryClient();
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Right panel edit state
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editDspId, setEditDspId] = useState('');
  const [editGeoJson, setEditGeoJson] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [newSectorName, setNewSectorName] = useState('');
  const [addingSector, setAddingSector] = useState(false);

  const { data: areasData, isLoading: areasLoading } = useQuery({
    queryKey: ['areas'],
    queryFn: async () => {
      const res = await api.get('/admin/areas');
      return (res.data.data?.areas ?? res.data.data) as Area[];
    },
  });

  const { data: sectorsData } = useQuery({
    queryKey: ['sectors', selectedAreaId],
    queryFn: async () => {
      const res = await api.get(`/admin/areas/${selectedAreaId}/sectors`);
      return (res.data.data?.sectors ?? res.data.data) as Sector[];
    },
    enabled: !!selectedAreaId,
  });

  const { data: dspListData } = useQuery({
    queryKey: ['dsp-list'],
    queryFn: async () => {
      const res = await api.get('/admin/dsp-users?limit=100');
      return (res.data.data?.users ?? res.data.data) as DspOption[];
    },
  });

  const areas: Area[] = areasData ?? [];
  const sectors: Sector[] = sectorsData ?? [];
  const dspList: DspOption[] = dspListData ?? [];

  const selectedArea = areas.find(a => a.id === selectedAreaId) ?? null;

  const handleSelectArea = (area: Area) => {
    setSelectedAreaId(area.id);
    setEditName(area.name);
    setEditColor(area.colorHex);
    setEditDspId(area.dspUserId ?? '');
    setEditGeoJson(area.boundaryGeoJson ?? '');
    setIsEditingName(false);
    setSaveError(null);
    setSaveSuccess(false);
  };

  const saveAreaMutation = useMutation({
    mutationFn: () => api.put(`/admin/areas/${selectedAreaId}`, {
      name: editName,
      colorHex: editColor,
      dspUserId: editDspId || null,
      geoJsonPolygon: editGeoJson ? JSON.parse(editGeoJson) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['areas'] });
      setSaveSuccess(true);
      setIsEditingName(false);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
    onError: (err: unknown) => setSaveError(apiErrorMessage(err)),
  });

  const deactivateAreaMutation = useMutation({
    mutationFn: () => api.put(`/admin/areas/${selectedAreaId}`, { isActive: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['areas'] });
    },
    onError: (err: unknown) => setSaveError(apiErrorMessage(err)),
  });

  const saveSectorMutation = useMutation({
    mutationFn: ({ id, name, colorHex }: { id: string; name: string; colorHex: string }) =>
      api.put(`/admin/sectors/${id}`, { name, colorHex }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sectors', selectedAreaId] }),
  });

  const createSectorMutation = useMutation({
    mutationFn: () => api.post(`/admin/areas/${selectedAreaId}/sectors`, {
      name: newSectorName,
      colorHex: '#3B82F6',
      displayOrder: sectors.length + 1,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors', selectedAreaId] });
      setNewSectorName('');
      setAddingSector(false);
    },
  });

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Left Panel */}
      <div className="w-[35%] bg-white border-r border-slate-200 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
          <h1 className="text-lg font-bold text-slate-800">Areas</h1>
          <button onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-sm font-medium hover:opacity-90"
            style={{ backgroundColor: '#1A3A5C' }}>
            <Plus size={14} /> Area Banao
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {areasLoading ? (
            <div className="flex justify-center py-8">
              <span className="w-6 h-6 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : areas.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">Koi area nahi hai</div>
          ) : (
            areas.map(area => (
              <div
                key={area.id}
                onClick={() => handleSelectArea(area)}
                className={`p-3 rounded-lg cursor-pointer transition-all border-2 ${
                  selectedAreaId === area.id
                    ? 'border-[#1A3A5C] bg-blue-50'
                    : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-4 h-4 rounded-full mt-0.5 shrink-0 border border-white shadow-sm"
                    style={{ backgroundColor: area.colorHex }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800 truncate">{area.name}</span>
                      {area.isActive ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700 shrink-0">Active</span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500 shrink-0">Inactive</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {area.sectorCount} sectors
                      {area.dspName && ` · ${area.dspName}`}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedArea ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3">
              <Plus size={24} className="opacity-40" />
            </div>
            <p className="text-lg font-medium">Area chunein</p>
            <p className="text-sm mt-1">Left panel se koi area select karein</p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            {/* Area Details */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-base font-semibold text-slate-700 mb-4">Area Details</h2>

              {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">{saveError}</div>
              )}
              {saveSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm mb-4">Changes save ho gaye!</div>
              )}

              <div className="space-y-4">
                {/* Name - inline editable */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Area Name</label>
                  <div className="flex items-center gap-2">
                    {isEditingName ? (
                      <input type="text" value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                        className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    ) : (
                      <span className="flex-1 text-slate-800 font-medium">{editName}</span>
                    )}
                    <button onClick={() => setIsEditingName(!isEditingName)}
                      className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600">
                      <Pencil size={14} />
                    </button>
                  </div>
                </div>

                {/* Color */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Color</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer border border-slate-300" />
                    <span className="text-sm font-mono text-slate-600">{editColor}</span>
                  </div>
                </div>

                {/* DSP */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">DSP Assign</label>
                  <select value={editDspId} onChange={e => setEditDspId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">-- Koi DSP nahi --</option>
                    {dspList.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.fullName}{d.badgeNumber ? ` (${d.badgeNumber})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-1">
                  <button onClick={() => saveAreaMutation.mutate()} disabled={saveAreaMutation.isPending}
                    className="px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-2"
                    style={{ backgroundColor: '#1A3A5C' }}>
                    {saveAreaMutation.isPending && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    Save Changes
                  </button>
                  {selectedArea.isActive && (
                    <button
                      onClick={() => { if (confirm('Area deactivate karein?')) deactivateAreaMutation.mutate(); }}
                      disabled={deactivateAreaMutation.isPending}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-60 hover:bg-red-700">
                      Deactivate Area
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* GeoJSON */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold text-slate-700">
                  Area ki Hadd <span className="text-slate-400 font-normal text-sm">(Optional)</span>
                </h2>
                <a href="https://geojson.io" target="_blank" rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  🗺️ Map pe draw karein
                </a>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                geojson.io website pe apne area ki boundary draw karein, phir wahan ka code copy kar ke yahan paste karein
              </p>
              <textarea value={editGeoJson} onChange={e => setEditGeoJson(e.target.value)}
                rows={4}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder='geojson.io se copy kiya hua code yahan paste karein...' />
              <div className="mt-3">
                <button onClick={() => saveAreaMutation.mutate()} disabled={saveAreaMutation.isPending || !editGeoJson.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-60 hover:bg-blue-700 flex items-center gap-2">
                  {saveAreaMutation.isPending && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Hadd Save Karein
                </button>
              </div>
            </div>

            {/* Sectors */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-slate-700">Sectors ({sectors.length})</h2>
                <button onClick={() => setAddingSector(!addingSector)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50">
                  <Plus size={14} /> Sector Add
                </button>
              </div>

              {addingSector && (
                <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <input type="text" value={newSectorName} onChange={e => setNewSectorName(e.target.value)}
                    placeholder="Sector name..."
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={() => { if (newSectorName.trim()) createSectorMutation.mutate(); }}
                    disabled={createSectorMutation.isPending || !newSectorName.trim()}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-60 hover:bg-blue-700">
                    Add
                  </button>
                  <button onClick={() => { setAddingSector(false); setNewSectorName(''); }}
                    className="px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50">
                    Cancel
                  </button>
                </div>
              )}

              {sectors.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Koi sector nahi. Sector add karein.</p>
              ) : (
                <div>
                  {sectors.map(sector => (
                    <SectorRow
                      key={sector.id}
                      sector={sector}
                      onSave={(id, name, colorHex) => saveSectorMutation.mutateAsync({ id, name, colorHex })}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateAreaModal
          dspList={dspList}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
