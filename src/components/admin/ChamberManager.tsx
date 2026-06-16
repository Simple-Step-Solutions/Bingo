import React, { useState, useMemo } from 'react';
import { Business, Town, RaffleEntry, Winner } from '../../types';
import { doc, setDoc, deleteDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { Store, Trash2, Plus, Nfc, QrCode, MapPin, Search, Download, Users, Ticket, Pencil, Trophy, Sparkles, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

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
}

export const ChamberManager: React.FC<ChamberManagerProps> = ({ businesses, towns, raffleEntries, winners }) => {
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
    
    // Shuffle entries
    const shuffled = [...raffleEntries].sort(() => Math.random() - 0.5);
    
    // Pick unique users
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
        prize: 'Raffle Prize'
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
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Business Management */}
      <div className="lg:col-span-2 space-y-8">
        <div className="bg-white border border-neutral-200 p-8 rounded-[2.5rem] shadow-sm">
          <div className="flex justify-between items-center mb-8">
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

          <div className="mt-8 flex items-center gap-3 bg-neutral-50 border border-neutral-100 rounded-2xl px-4 py-3">
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

          <div className="mt-6 space-y-4">
            {pagedBusinesses.map(biz => (
              <div key={biz.id} className="flex flex-col p-6 bg-neutral-50 rounded-3xl border border-neutral-100 group hover:border-neutral-900 transition-all">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white border border-neutral-200 rounded-2xl flex items-center justify-center text-neutral-400 group-hover:text-neutral-900 transition-colors shadow-sm">
                      <Store size={24} />
                    </div>
                    <div>
                      <p className="font-bold text-lg">{biz.name}</p>
                      <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                        {biz.town} • {biz.category || 'General'} • {biz.task}
                      </p>
                      {biz.address && (
                        <p className="text-[10px] text-neutral-400 mt-1 flex items-center gap-1">
                          <MapPin size={10} /> {biz.address}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => editBusiness(biz)}
                      className="p-3 bg-white border border-neutral-200 rounded-xl text-neutral-400 hover:text-neutral-900 hover:border-neutral-900 transition-all shadow-sm"
                      title="Edit Business"
                    >
                      <Pencil size={18} />
                    </button>
                    <button 
                      onClick={() => setSelectedQR({ value: biz.qrCode, title: biz.name })}
                      className="p-3 bg-white border border-neutral-200 rounded-xl text-neutral-400 hover:text-neutral-900 hover:border-neutral-900 transition-all shadow-sm"
                      title="Generate QR Code"
                    >
                      <QrCode size={18} />
                    </button>
                    <button 
                      onClick={() => deleteBusiness(biz.id)} 
                      className="p-3 bg-white border border-neutral-200 rounded-xl text-neutral-300 hover:text-red-500 hover:border-red-200 transition-all shadow-sm"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 border-t border-neutral-200/50">
                  <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-neutral-100">
                    <Nfc size={16} className="text-neutral-400" />
                    <input 
                      placeholder="Associate NFC ID"
                      value={biz.nfcId || ''}
                      onChange={(e) => updateBusinessNfc(biz.id, e.target.value)}
                      className="flex-1 bg-transparent text-[10px] uppercase tracking-widest font-bold outline-none border-none focus:ring-0"
                    />
                  </div>
                  <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-neutral-100">
                    <code className="text-[10px] text-neutral-400 font-mono uppercase tracking-widest">Code: {biz.qrCode}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {bizPageCount > 1 && (
            <div className="flex items-center justify-between mt-6 pt-6 border-t border-neutral-100">
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

        <div className="bg-white border border-neutral-200 p-8 rounded-[2.5rem] shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="bg-yellow-50 p-2 rounded-xl">
                <Ticket className="text-yellow-600" size={20} />
              </div>
              <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Raffle Entries</h3>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-neutral-50 px-3 py-2 rounded-xl border border-neutral-100">
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
                className="bg-neutral-900 text-white px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-md disabled:opacity-50"
              >
                Pick Randomly
              </button>
            </div>
          </div>

          {tempWinners.length > 0 && (
            <div className="mb-10 p-6 bg-yellow-50 rounded-3xl border border-yellow-100 animate-in zoom-in-95 duration-300">
              <div className="flex items-center gap-2 mb-6 text-yellow-800">
                <Sparkles size={18} />
                <h4 className="font-bold uppercase tracking-widest text-[10px]">Newly Picked Winners</h4>
              </div>
              <div className="space-y-4">
                {tempWinners.map(winner => (
                  <div key={winner.id} className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600">
                        <Trophy size={14} />
                      </div>
                      <div>
                        <p className="font-bold text-sm">{winner.userName || winner.userEmail}</p>
                        <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">{winner.userEmail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-6">
                <button 
                  onClick={saveWinners}
                  className="flex-1 bg-yellow-600 text-white py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-yellow-700 transition-all shadow-md"
                >
                  Confirm & Save Winners
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
          
          <div className="divide-y divide-neutral-100">
            {raffleEntries.length > 0 ? raffleEntries.map(entry => (
              <div key={entry.id} className="flex justify-between items-center py-6 first:pt-0 last:pb-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400">
                    <Users size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">{entry.userName || entry.userEmail}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">{new Date(entry.timestamp).toLocaleString()}</p>
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
                  <Trash2 size={18} />
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

        <div className="bg-white border border-neutral-200 p-8 rounded-[2.5rem] shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-neutral-900 p-2 rounded-xl">
              <Trophy className="text-white" size={20} />
            </div>
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Official Winners</h3>
          </div>
          
          <div className="divide-y divide-neutral-100">
            {winners.length > 0 ? winners.map(winner => (
              <div key={winner.id} className="flex justify-between items-center py-6 first:pt-0 last:pb-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600">
                    <Trophy size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">{winner.userName || winner.userEmail}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">{new Date(winner.timestamp).toLocaleString()}</p>
                      <span className="text-[10px] bg-yellow-50 px-2 py-0.5 rounded-full text-yellow-700 font-bold uppercase tracking-widest">
                        Winner
                      </span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => deleteWinner(winner.id)} 
                  className="p-2 text-neutral-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={18} />
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

      {/* Add Business & Towns */}
      <div className="space-y-8">
        <div className="bg-neutral-900 text-white p-10 rounded-[2.5rem] shadow-2xl">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">
              {editingId ? 'Edit Business' : 'Quick Add Business'}
            </h3>
            {editingId && (
              <button 
                onClick={() => {
                  setEditingId(null);
                  setNewBiz({
                    name: '', town: 'Yorktown', task: '', category: 'Retail', address: '', lat: 0, lng: 0, nfcId: '',
                    description: '', image: '', website: ''
                  });
                }}
                className="text-[10px] uppercase tracking-widest font-bold text-neutral-500 hover:text-white"
              >
                Cancel
              </button>
            )}
          </div>
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">Business Name</label>
              <input 
                placeholder="e.g. Main Street Bakery"
                value={newBiz.name}
                onChange={e => setNewBiz({...newBiz, name: e.target.value})}
                className="w-full p-4 bg-white/10 border border-white/10 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-white/20 transition-all outline-none"
              />
            </div>
            
            <div>
              <label className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">Location Search</label>
              <AddressSearch onSelect={(lat, lng, address) => setNewBiz({...newBiz, lat, lng, address})} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">Town</label>
                <select 
                  value={newBiz.town}
                  onChange={e => setNewBiz({...newBiz, town: e.target.value})}
                  className="w-full p-4 bg-white/10 border border-white/10 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-white/20 transition-all outline-none"
                >
                  {towns.map(t => <option key={t.id} value={t.name} className="bg-neutral-900">{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">NFC ID</label>
                <div className="flex items-center gap-3 p-4 bg-white/10 border border-white/10 rounded-2xl focus-within:ring-2 focus-within:ring-white/20 transition-all">
                  <Nfc size={18} className="text-neutral-400" />
                  <input 
                    placeholder="Optional"
                    value={newBiz.nfcId}
                    onChange={e => setNewBiz({...newBiz, nfcId: e.target.value})}
                    className="flex-1 bg-transparent outline-none text-sm font-medium"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">Business Category</label>
              <select 
                value={newBiz.category}
                onChange={e => setNewBiz({...newBiz, category: e.target.value})}
                className="w-full p-4 bg-white/10 border border-white/10 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-white/20 transition-all outline-none"
              >
                <option value="Retail" className="bg-neutral-900">Retail</option>
                <option value="Restaurant" className="bg-neutral-900">Restaurant</option>
                <option value="Service" className="bg-neutral-900">Service</option>
                <option value="Entertainment" className="bg-neutral-900">Entertainment</option>
                <option value="Other" className="bg-neutral-900">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">Task Description</label>
              <input 
                placeholder="e.g. Buy a coffee"
                value={newBiz.task}
                onChange={e => setNewBiz({...newBiz, task: e.target.value})}
                className="w-full p-4 bg-white/10 border border-white/10 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-white/20 transition-all outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">About Business (Optional)</label>
              <textarea 
                placeholder="Brief description of the business..."
                value={newBiz.description}
                onChange={e => setNewBiz({...newBiz, description: e.target.value})}
                className="w-full p-4 bg-white/10 border border-white/10 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-white/20 transition-all outline-none h-24 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">Image URL (Optional)</label>
                <input 
                  placeholder="https://..."
                  value={newBiz.image}
                  onChange={e => setNewBiz({...newBiz, image: e.target.value})}
                  className="w-full p-4 bg-white/10 border border-white/10 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-white/20 transition-all outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">Website (Optional)</label>
                <input 
                  placeholder="https://..."
                  value={newBiz.website}
                  onChange={e => setNewBiz({...newBiz, website: e.target.value})}
                  className="w-full p-4 bg-white/10 border border-white/10 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-white/20 transition-all outline-none"
                />
              </div>
            </div>

            <button 
              onClick={addBusiness}
              disabled={isGeocoding}
              className="w-full bg-white text-neutral-900 p-5 rounded-2xl font-bold hover:bg-neutral-100 transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isGeocoding && <Loader2 className="animate-spin" size={18} />}
              {editingId ? 'Update Business' : 'Add Business'}
            </button>
          </div>
        </div>

        <div className="bg-white border border-neutral-200 p-8 rounded-[2.5rem] shadow-sm">
          <h3 className="font-bold uppercase tracking-widest text-xs mb-8 text-neutral-400">Manage Towns</h3>
          <div className="flex gap-3 mb-8">
            <input 
              placeholder="New Town Name"
              value={newTown}
              onChange={e => setNewTown(e.target.value)}
              className="flex-1 p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
            />
            <button 
              onClick={addTown} 
              className="bg-neutral-900 text-white p-4 rounded-2xl hover:bg-neutral-800 transition-all shadow-md"
            >
              <Plus size={20} />
            </button>
          </div>
          <div className="space-y-3">
            {towns.map(t => (
              <div key={t.id} className="flex justify-between items-center p-4 bg-neutral-50 rounded-2xl border border-neutral-100 group hover:border-neutral-900 transition-all">
                <span className="text-sm font-bold">{t.name}</span>
                <button 
                  onClick={() => deleteTown(t.id)} 
                  className="p-2 text-neutral-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
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
