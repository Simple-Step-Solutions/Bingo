import React, { useState, useMemo, useRef } from 'react';
import { Business, Town, RaffleEntry, Winner, AppSettings } from '../../types';
import { doc, setDoc, deleteDoc, addDoc, collection } from 'firebase/firestore';
import { db, storage } from '../../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Store, Trash2, Plus, Nfc, QrCode, MapPin, Search, Users, Ticket, Pencil, Trophy, Sparkles, Loader2, ChevronLeft, ChevronRight, Palette, ImagePlus } from 'lucide-react';

const DEFAULT_PRIMARY = '#1695B2';
const DEFAULT_ACCENT = '#CC5500';

const BIZ_PAGE_SIZE = 20;
import { CSVImport } from '../CSVImport';
import { AddressSearch } from '../AddressSearch';
import { geocodeAddress } from '../../lib/geocoding';
import { QRModal } from '../QRModal';

interface ChamberManagerProps {
  businesses: Business[];
  towns: Town[];
  raffleEntries: RaffleEntry[];
  winners: Winner[];
  settings: AppSettings;
}

const INPUT_CLS = 'w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none transition-all';
const LABEL_CLS = 'block text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2';

export const ChamberManager: React.FC<ChamberManagerProps> = ({ businesses, towns, raffleEntries, winners, settings }) => {
  const [newBiz, setNewBiz] = useState({
    name: '',
    town: 'Yorktown',
    task: '',
    category: 'Retail',
    address: '',
    lat: 0,
    lng: 0,
    nfcId: '',
    description: '',
    image: '',
    website: ''
  });
  const [newTown, setNewTown] = useState('');
  const [selectedQR, setSelectedQR] = useState<{ value: string; title: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [numWinnersToPick, setNumWinnersToPick] = useState(1);
  const [tempWinners, setTempWinners] = useState<RaffleEntry[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [bizSearch, setBizSearch] = useState('');
  const [bizPage, setBizPage] = useState(0);
  const [logoUploading, setLogoUploading] = useState(false);
  // Local NFC state to avoid Firebase write on every keystroke
  const [nfcValues, setNfcValues] = useState<Record<string, string>>({});
  const logoInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const filteredBusinesses = useMemo(() => {
    const q = bizSearch.toLowerCase().trim();
    if (!q) return businesses;
    return businesses.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.town.toLowerCase().includes(q) ||
      (b.category || '').toLowerCase().includes(q) ||
      b.task.toLowerCase().includes(q)
    );
  }, [businesses, bizSearch]);

  const bizPageCount = Math.ceil(filteredBusinesses.length / BIZ_PAGE_SIZE);
  const pagedBusinesses = filteredBusinesses.slice(bizPage * BIZ_PAGE_SIZE, (bizPage + 1) * BIZ_PAGE_SIZE);

  const handleBizSearch = (val: string) => {
    setBizSearch(val);
    setBizPage(0);
  };

  const pickWinners = () => {
    if (raffleEntries.length === 0) return;
    const shuffled = [...raffleEntries].sort(() => Math.random() - 0.5);
    const uniqueWinners: RaffleEntry[] = [];
    const seenUsers = new Set<string>();
    for (const entry of shuffled) {
      if (!seenUsers.has(entry.userId)) {
        uniqueWinners.push(entry);
        seenUsers.add(entry.userId);
      }
      if (uniqueWinners.length >= numWinnersToPick) break;
    }
    setTempWinners(uniqueWinners);
  };

  const saveWinners = async () => {
    for (const winner of tempWinners) {
      await addDoc(collection(db, 'winners'), {
        userId: winner.userId,
        userName: winner.userName,
        userEmail: winner.userEmail,
        timestamp: new Date().toISOString(),
        prize: settings.bingoPrize || 'Raffle Prize'
      });
    }
    setTempWinners([]);
  };

  const deleteWinner = async (id: string) => {
    await deleteDoc(doc(db, 'winners', id));
  };

  const addBusiness = async () => {
    if (!newBiz.name || !newBiz.task || !newBiz.address) return;

    let finalLat = newBiz.lat;
    let finalLng = newBiz.lng;

    if (!finalLat || !finalLng) {
      setIsGeocoding(true);
      const coords = await geocodeAddress(newBiz.address);
      if (coords) {
        finalLat = coords.lat;
        finalLng = coords.lng;
      }
      setIsGeocoding(false);
    }

    const id = editingId || Math.random().toString(36).substr(2, 9);
    await setDoc(doc(db, 'businesses', id), {
      ...newBiz,
      lat: finalLat,
      lng: finalLng,
      id,
      qrCode: editingId ? businesses.find(b => b.id === editingId)?.qrCode : `CHAMBER_${id}`
    });
    setNewBiz({
      name: '',
      town: 'Yorktown',
      task: '',
      category: 'Retail',
      address: '',
      lat: 0,
      lng: 0,
      nfcId: '',
      description: '',
      image: '',
      website: ''
    });
    setEditingId(null);
  };

  const editBusiness = (biz: Business) => {
    setNewBiz({
      name: biz.name,
      town: biz.town,
      task: biz.task,
      category: biz.category || 'Retail',
      address: biz.address || '',
      lat: biz.lat || 0,
      lng: biz.lng || 0,
      nfcId: biz.nfcId || '',
      description: biz.description || '',
      image: biz.image || '',
      website: biz.website || ''
    });
    setEditingId(biz.id);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const updateBusinessNfc = async (id: string, nfcId: string) => {
    await setDoc(doc(db, 'businesses', id), { nfcId }, { merge: true });
  };

  const deleteBusiness = async (id: string) => {
    await deleteDoc(doc(db, 'businesses', id));
  };

  const addTown = async () => {
    if (!newTown) return;
    await addDoc(collection(db, 'towns'), { name: newTown });
    setNewTown('');
  };

  const deleteTown = async (id: string) => {
    await deleteDoc(doc(db, 'towns', id));
  };

  const deleteRaffleEntry = async (id: string) => {
    await deleteDoc(doc(db, 'raffle_entries', id));
  };

  const updateSettings = async (field: keyof AppSettings, value: any) => {
    await setDoc(doc(db, 'settings', 'global'), { [field]: value }, { merge: true });
  };

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const storageRef = ref(storage, 'branding/chamber-logo');
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateSettings('chamberLogoUrl', url);
    } catch (err) {
      console.error('Logo upload failed:', err);
    } finally {
      setLogoUploading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Branding */}
      <div className="lg:col-span-3 bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-neutral-100 p-2 rounded-xl">
            <Palette className="text-neutral-900" size={20} />
          </div>
          <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Branding</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Logo */}
          <div className="flex flex-col gap-3">
            <label className={LABEL_CLS}>Chamber Logo</label>
            <div
              onClick={() => logoInputRef.current?.click()}
              className="relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-neutral-200 p-6 cursor-pointer hover:border-neutral-400 transition-all bg-neutral-50"
            >
              {logoUploading ? (
                <Loader2 className="animate-spin text-neutral-400" size={24} />
              ) : settings.chamberLogoUrl ? (
                <img src={settings.chamberLogoUrl} alt="Chamber Logo" className="h-12 w-auto object-contain" />
              ) : (
                <ImagePlus className="text-neutral-300" size={24} />
              )}
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                {settings.chamberLogoUrl ? 'Replace' : 'Upload Logo'}
              </span>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleLogoUpload(file);
              }}
            />
          </div>

          {/* Chamber Name */}
          <div className="md:col-span-1">
            <label className={LABEL_CLS}>Chamber Name</label>
            <input
              value={settings.chamberName || ''}
              onChange={e => updateSettings('chamberName', e.target.value)}
              placeholder="Hudson Valley Gateway Chamber of Commerce"
              className={INPUT_CLS}
            />
            <p className="text-[10px] text-neutral-400 mt-2 italic">Displayed in the app footer and onboarding.</p>
          </div>

          {/* Primary Color */}
          <div>
            <label className={LABEL_CLS}>Primary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.primaryColor || DEFAULT_PRIMARY}
                onChange={e => updateSettings('primaryColor', e.target.value)}
                className="w-14 h-14 rounded-2xl border border-neutral-200 cursor-pointer bg-neutral-50 p-1"
              />
              <div className="flex-1">
                <input
                  type="text"
                  value={settings.primaryColor || DEFAULT_PRIMARY}
                  onChange={e => {
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) updateSettings('primaryColor', e.target.value);
                  }}
                  className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-[var(--color-primary)] outline-none uppercase"
                  maxLength={7}
                />
                <p className="text-[10px] text-neutral-400 mt-1 font-bold uppercase tracking-widest">Buttons, accents, links</p>
              </div>
            </div>
          </div>

          {/* Accent Color */}
          <div>
            <label className={LABEL_CLS}>Accent Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.accentColor || DEFAULT_ACCENT}
                onChange={e => updateSettings('accentColor', e.target.value)}
                className="w-14 h-14 rounded-2xl border border-neutral-200 cursor-pointer bg-neutral-50 p-1"
              />
              <div className="flex-1">
                <input
                  type="text"
                  value={settings.accentColor || DEFAULT_ACCENT}
                  onChange={e => {
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) updateSettings('accentColor', e.target.value);
                  }}
                  className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-[var(--color-primary)] outline-none uppercase"
                  maxLength={7}
                />
                <p className="text-[10px] text-neutral-400 mt-1 font-bold uppercase tracking-widest">CTAs, free space, prizes</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4 p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl" style={{ backgroundColor: settings.primaryColor || DEFAULT_PRIMARY }} />
            <div className="w-8 h-8 rounded-xl" style={{ backgroundColor: settings.accentColor || DEFAULT_ACCENT }} />
          </div>
          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Color changes apply instantly for all users.</p>
        </div>
      </div>

      {/* Business Management */}
      <div className="lg:col-span-2 space-y-8">
        <div className="bg-white border border-neutral-200 p-6 rounded-3xl shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-neutral-100 p-2 rounded-xl">
                <Store className="text-neutral-900" size={20} />
              </div>
              <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Participating Businesses</h3>
            </div>
            <span className="text-[10px] bg-neutral-100 px-3 py-1 rounded-full font-bold text-neutral-600 uppercase tracking-widest">
              {businesses.length} Total
            </span>
          </div>

          <CSVImport onComplete={() => {}} />

          <div className="mt-6 flex items-center gap-3 bg-neutral-50 border border-neutral-200 rounded-2xl px-4 py-3">
            <Search size={16} className="text-neutral-400 shrink-0" />
            <input
              type="text"
              placeholder="Search by name, town, category, or task..."
              value={bizSearch}
              onChange={e => handleBizSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none font-medium placeholder:text-neutral-300"
            />
            {bizSearch && (
              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest shrink-0">
                {filteredBusinesses.length} result{filteredBusinesses.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="mt-4 divide-y divide-neutral-100">
            {pagedBusinesses.map(biz => {
              const nfcVal = nfcValues[biz.id] ?? (biz.nfcId || '');
              return (
                <div key={biz.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0 group">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{biz.name}</p>
                    <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold truncate">
                      {biz.town} &bull; {biz.category || 'General'}
                    </p>
                    {biz.nfcId && (
                      <p className="text-[10px] text-neutral-300 font-mono mt-0.5">NFC: {biz.nfcId}</p>
                    )}
                  </div>
                  {/* Inline NFC edit field */}
                  <div className="hidden sm:flex items-center gap-2 bg-neutral-50 border border-neutral-100 rounded-xl px-3 py-2">
                    <Nfc size={12} className="text-neutral-400 shrink-0" />
                    <input
                      placeholder="NFC ID"
                      value={nfcVal}
                      onChange={e => setNfcValues(prev => ({ ...prev, [biz.id]: e.target.value }))}
                      onBlur={e => updateBusinessNfc(biz.id, e.target.value)}
                      className="w-24 bg-transparent text-[10px] uppercase tracking-widest font-bold outline-none border-none focus:ring-0"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => editBusiness(biz)}
                      className="p-2 rounded-xl border border-neutral-200 text-neutral-400 hover:text-neutral-900 hover:border-neutral-900 transition-all"
                      title="Edit Business"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setSelectedQR({ value: biz.qrCode, title: biz.name })}
                      className="p-2 rounded-xl border border-neutral-200 text-neutral-400 hover:text-neutral-900 hover:border-neutral-900 transition-all"
                      title="QR Code"
                    >
                      <QrCode size={14} />
                    </button>
                    <button
                      onClick={() => deleteBusiness(biz.id)}
                      className="p-2 rounded-xl border border-neutral-200 text-neutral-300 hover:text-red-500 hover:border-red-200 transition-all"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {bizPageCount > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-100">
              <button
                onClick={() => setBizPage(p => Math.max(0, p - 1))}
                disabled={bizPage === 0}
                className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                Page {bizPage + 1} of {bizPageCount}
              </span>
              <button
                onClick={() => setBizPage(p => Math.min(bizPageCount - 1, p + 1))}
                disabled={bizPage >= bizPageCount - 1}
                className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-colors"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Raffle Entries */}
        <div className="bg-white border border-neutral-200 p-6 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-yellow-50 p-2 rounded-xl">
              <Ticket className="text-yellow-600" size={20} />
            </div>
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Raffle Entries</h3>
            <span className="ml-auto text-[10px] bg-neutral-100 px-3 py-1 rounded-full font-bold text-neutral-600 uppercase tracking-widest">
              {raffleEntries.length} entries
            </span>
          </div>

          <div className="divide-y divide-neutral-100">
            {raffleEntries.length > 0 ? raffleEntries.map(entry => (
              <div key={entry.id} className="flex justify-between items-center py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400">
                    <Users size={14} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">{entry.userName || entry.userEmail}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">{new Date(entry.timestamp).toLocaleDateString()}</p>
                      <span className="text-[10px] bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600 font-bold uppercase tracking-widest">
                        {entry.completionsCount} Tasks
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => deleteRaffleEntry(entry.id)}
                  className="p-2 text-neutral-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )) : (
              <div className="text-center py-12">
                <Ticket className="mx-auto text-neutral-100 mb-4" size={48} />
                <p className="text-neutral-400 text-sm italic">No raffle entries yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Raffle Winner Picker */}
        <div className="bg-white border border-neutral-200 p-6 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-yellow-50 p-2 rounded-xl">
              <Sparkles className="text-yellow-600" size={20} />
            </div>
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Pick Raffle Winners</h3>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-2 bg-neutral-50 px-4 py-3 rounded-xl border border-neutral-200 flex-1">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Pick</span>
              <input
                type="number"
                min="1"
                max={raffleEntries.length}
                value={numWinnersToPick}
                onChange={(e) => setNumWinnersToPick(parseInt(e.target.value) || 1)}
                className="w-12 bg-transparent text-sm font-bold outline-none text-center"
              />
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Winners</span>
            </div>
            <button
              onClick={pickWinners}
              disabled={raffleEntries.length === 0}
              className="bg-neutral-900 text-white px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-md disabled:opacity-50"
            >
              Pick Randomly
            </button>
          </div>

          {tempWinners.length > 0 && (
            <div className="p-6 bg-yellow-50 rounded-3xl border border-yellow-100 animate-in zoom-in-95 duration-300">
              <div className="flex items-center gap-2 mb-4 text-yellow-800">
                <Sparkles size={16} />
                <h4 className="font-bold uppercase tracking-widest text-[10px]">Newly Picked Winners</h4>
              </div>
              <div className="space-y-3">
                {tempWinners.map(winner => (
                  <div key={winner.id} className="flex items-center gap-3 bg-white p-4 rounded-2xl shadow-sm">
                    <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600">
                      <Trophy size={14} />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{winner.userName || winner.userEmail}</p>
                      <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">{winner.userEmail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={saveWinners}
                  className="flex-1 bg-yellow-600 text-white py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-yellow-700 transition-all shadow-md"
                >
                  Confirm &amp; Save Winners
                </button>
                <button
                  onClick={() => setTempWinners([])}
                  className="px-6 py-3 bg-white border border-yellow-200 text-yellow-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-yellow-50 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Official Winners */}
        <div className="bg-white border border-neutral-200 p-6 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-neutral-900 p-2 rounded-xl">
              <Trophy className="text-white" size={20} />
            </div>
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Official Winners</h3>
          </div>

          <div className="divide-y divide-neutral-100">
            {winners.length > 0 ? winners.map(winner => (
              <div key={winner.id} className="flex justify-between items-center py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600">
                    <Trophy size={14} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">{winner.userName || winner.userEmail}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">{new Date(winner.timestamp).toLocaleDateString()}</p>
                      {winner.prize && (
                        <span className="text-[10px] bg-yellow-50 px-2 py-0.5 rounded-full text-yellow-700 font-bold uppercase tracking-widest">
                          {winner.prize}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => deleteWinner(winner.id)}
                  className="p-2 text-neutral-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )) : (
              <div className="text-center py-12">
                <Trophy className="mx-auto text-neutral-100 mb-4" size={48} />
                <p className="text-neutral-400 text-sm italic">No winners announced yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Business form + Towns */}
      <div className="space-y-8">
        <div ref={formRef} className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">
              {editingId ? 'Edit Business' : 'Add Business'}
            </h3>
            {editingId && (
              <button
                onClick={() => {
                  setEditingId(null);
                  setNewBiz({ name: '', town: 'Yorktown', task: '', category: 'Retail', address: '', lat: 0, lng: 0, nfcId: '', description: '', image: '', website: '' });
                }}
                className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 hover:text-red-500 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="space-y-5">
            <div>
              <label className={LABEL_CLS}>Business Name</label>
              <input
                placeholder="e.g. Main Street Bakery"
                value={newBiz.name}
                onChange={e => setNewBiz({ ...newBiz, name: e.target.value })}
                className={INPUT_CLS}
              />
            </div>

            <div>
              <label className={LABEL_CLS}>Location Search</label>
              <AddressSearch onSelect={(lat, lng, address) => setNewBiz({ ...newBiz, lat, lng, address })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>Town</label>
                <select
                  value={newBiz.town}
                  onChange={e => setNewBiz({ ...newBiz, town: e.target.value })}
                  className={INPUT_CLS}
                >
                  {towns.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>NFC ID</label>
                <div className="flex items-center gap-2 px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl focus-within:ring-2 focus-within:ring-[var(--color-primary)] transition-all">
                  <Nfc size={16} className="text-neutral-400" />
                  <input
                    placeholder="Optional"
                    value={newBiz.nfcId}
                    onChange={e => setNewBiz({ ...newBiz, nfcId: e.target.value })}
                    className="flex-1 bg-transparent outline-none text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className={LABEL_CLS}>Business Category</label>
              <select
                value={newBiz.category}
                onChange={e => setNewBiz({ ...newBiz, category: e.target.value })}
                className={INPUT_CLS}
              >
                <option value="Retail">Retail</option>
                <option value="Restaurant">Restaurant</option>
                <option value="Service">Service</option>
                <option value="Entertainment">Entertainment</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className={LABEL_CLS}>Task Description</label>
              <input
                placeholder="e.g. Buy a coffee"
                value={newBiz.task}
                onChange={e => setNewBiz({ ...newBiz, task: e.target.value })}
                className={INPUT_CLS}
              />
            </div>

            <div>
              <label className={LABEL_CLS}>About Business (Optional)</label>
              <textarea
                placeholder="Brief description of the business..."
                value={newBiz.description}
                onChange={e => setNewBiz({ ...newBiz, description: e.target.value })}
                className={`${INPUT_CLS} h-24 resize-none`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>Image URL (Optional)</label>
                <input
                  placeholder="https://..."
                  value={newBiz.image}
                  onChange={e => setNewBiz({ ...newBiz, image: e.target.value })}
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Website (Optional)</label>
                <input
                  placeholder="https://..."
                  value={newBiz.website}
                  onChange={e => setNewBiz({ ...newBiz, website: e.target.value })}
                  className={INPUT_CLS}
                />
              </div>
            </div>

            <button
              onClick={addBusiness}
              disabled={isGeocoding}
              className="w-full bg-neutral-900 text-white py-4 rounded-2xl font-bold text-sm hover:bg-neutral-800 transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isGeocoding && <Loader2 className="animate-spin" size={18} />}
              {editingId ? 'Update Business' : 'Add Business'}
            </button>
          </div>
        </div>

        {/* Manage Towns */}
        <div className="bg-white border border-neutral-200 p-6 rounded-3xl shadow-sm">
          <h3 className="font-bold uppercase tracking-widest text-xs mb-6 text-neutral-400">Manage Towns</h3>
          <div className="flex gap-3 mb-6">
            <input
              placeholder="New Town Name"
              value={newTown}
              onChange={e => setNewTown(e.target.value)}
              className={`flex-1 ${INPUT_CLS}`}
            />
            <button
              onClick={addTown}
              className="bg-neutral-900 text-white px-4 py-3 rounded-2xl hover:bg-neutral-800 transition-all shadow-md"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="space-y-2">
            {towns.map(t => (
              <div key={t.id} className="flex justify-between items-center p-3 bg-neutral-50 rounded-2xl border border-neutral-100 hover:border-neutral-300 transition-all">
                <span className="text-sm font-bold">{t.name}</span>
                <button
                  onClick={() => deleteTown(t.id)}
                  className="p-1.5 text-neutral-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedQR && (
        <QRModal
          isOpen={!!selectedQR}
          onClose={() => setSelectedQR(null)}
          value={selectedQR.value}
          title={selectedQR.title}
        />
      )}
    </div>
  );
};
