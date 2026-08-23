import React, { useState, useMemo, useRef } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { AppSettings, Business, Town } from '../../types';
import {
  Store, Trash2, Nfc, QrCode, Search, Pencil, Loader2, ChevronLeft, ChevronRight,
  Download, Printer, AlertTriangle, Mail,
} from 'lucide-react';
import { provisionBusinessCode, setBusinessNfc, createInvite, errorMessage, isExpectedError } from '../../services/api';
import { CSVImport } from '../CSVImport';
import { AddressSearch } from '../AddressSearch';
import { geocodeAddress } from '../../lib/geocoding';
import { newDocId } from '../../lib/utils';
import { HelpTip } from './HelpTip';
import { ConfirmButton } from './ConfirmButton';
import { PosterModal, PosterData } from './PosterModal';
import { DEFAULT_CATEGORIES } from './CategoryManager';

const BIZ_PAGE_SIZE = 20;

interface BusinessManagerProps {
  businesses: Business[];
  towns: Town[];
  settings: AppSettings;
  /** Businesses needed to fill a board at the current size, for the shortfall warning. */
  boardSize: number;
}

const emptyForm = (defaultTown: string, defaultCategory: string) => ({
  name: '', town: defaultTown, task: '', category: defaultCategory,
  address: '', lat: 0, lng: 0, nfcId: '', description: '', image: '', website: '', email: '',
});

export const BusinessManager: React.FC<BusinessManagerProps> = ({ businesses, towns, settings, boardSize }) => {
  const categories = settings.businessCategories ?? DEFAULT_CATEGORIES;
  const defaultTown = towns[0]?.name ?? '';
  const defaultCategory = categories[0] ?? 'Other';

  const [newBiz, setNewBiz] = useState(() => emptyForm(defaultTown, defaultCategory));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [bizSearch, setBizSearch] = useState('');
  const [bizPage, setBizPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [posterBusy, setPosterBusy] = useState<string | null>(null);
  const [posters, setPosters] = useState<PosterData[] | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // The town select used to default to the hardcoded string "Yorktown". If that
  // town was not on the list the dropdown displayed the first real town while
  // state still held "Yorktown", so the business saved to a town nobody could
  // ever be assigned to. Resolve against the real list at render instead of
  // holding a value that can go stale when towns load or change.
  const selectedTown = towns.some(t => t.name === newBiz.town) ? newBiz.town : defaultTown;

  const needed = boardSize * boardSize - 1;
  const shortfall = needed - businesses.length;
  const withEmail = businesses.filter(b => b.email?.trim());

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

  const resetForm = () => {
    setEditingId(null);
    setFormError(null);
    setNewBiz(emptyForm(defaultTown, defaultCategory));
  };

  const addBusiness = async () => {
    const missing: string[] = [];
    if (!newBiz.name.trim()) missing.push('a business name');
    if (!newBiz.address.trim()) missing.push('an address');
    if (!newBiz.task.trim()) missing.push('a task');
    if (!selectedTown) missing.push('a town');
    if (missing.length) {
      setFormError(`Still needs ${missing.join(', ')}.`);
      return;
    }

    setFormError(null);
    setSaveError(null);

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

    if (!finalLat || !finalLng) {
      setFormError('That address could not be placed on the map, so the check-in radius would not work. Pick a suggestion from Location Search instead of typing the address by hand.');
      return;
    }

    const id = editingId || newDocId();

    // The business document carries neither a code nor an NFC serial. The code
    // is provisioned server-side into business_secrets and the serial is
    // registered in the code index, so a player can read neither.
    const { nfcId, ...publicFields } = newBiz;
    await setDoc(doc(db, 'businesses', id), {
      ...publicFields, town: selectedTown, lat: finalLat, lng: finalLng, id,
    });

    try {
      // Idempotent: returns the existing code when there already is one.
      await provisionBusinessCode({ businessId: id });
      await setBusinessNfc({ businessId: id, nfcId: nfcId?.trim() || null });
    } catch (err) {
      if (!isExpectedError(err)) console.error('Code provisioning failed:', err);
      setSaveError(errorMessage(err, 'The business was saved but its code could not be issued. Open its poster to try again.'));
    }

    resetForm();
  };

  const editBusiness = (biz: Business) => {
    setFormError(null);
    setNewBiz({
      name: biz.name,
      town: biz.town || defaultTown,
      task: biz.task,
      category: biz.category || defaultCategory,
      address: biz.address || '',
      lat: biz.lat || 0,
      lng: biz.lng || 0,
      nfcId: biz.nfcId || '',
      description: biz.description || '',
      image: biz.image || '',
      website: biz.website || '',
      email: biz.email || '',
    });
    setEditingId(biz.id);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  /**
   * Codes are not on the business document, so a poster has to fetch one.
   * provisionBusinessCode is idempotent and returns the existing code, which
   * also backfills a business created before the code split.
   */
  const showPosterFor = async (biz: Business) => {
    setSaveError(null);
    setPosterBusy(biz.id);
    try {
      const { code } = await provisionBusinessCode({ businessId: biz.id });
      setPosters([{ businessId: biz.id, name: biz.name, town: biz.town, task: biz.task, code }]);
    } catch (err) {
      if (!isExpectedError(err)) console.error('provisionBusinessCode failed:', err);
      setSaveError(errorMessage(err, 'Could not load the code for that business.'));
    } finally {
      setPosterBusy(null);
    }
  };

  const printAllPosters = async () => {
    setSaveError(null);
    setPosterBusy('all');
    try {
      const all: PosterData[] = [];
      for (const biz of businesses) {
        const { code } = await provisionBusinessCode({ businessId: biz.id });
        all.push({ businessId: biz.id, name: biz.name, town: biz.town, task: biz.task, code });
      }
      setPosters(all);
    } catch (err) {
      if (!isExpectedError(err)) console.error('provisionBusinessCode failed:', err);
      setSaveError(errorMessage(err, 'Could not load every code. Try again, or print posters one at a time.'));
    } finally {
      setPosterBusy(null);
    }
  };

  const exportMailMerge = async () => {
    if (withEmail.length === 0) return;
    setExporting(true);
    setSaveError(null);
    try {
      const rows = await Promise.all(
        withEmail.map(async (biz: Business) => {
          const { token } = await createInvite({
            role: 'business',
            businessId: biz.id,
            businessName: biz.name,
            ...(biz.email ? { emailHint: biz.email } : {}),
          });
          const url = `${window.location.origin}/?invite=${token}`;
          return [biz.name, biz.email ?? '', url];
        })
      );
      const csv = ['Business Name,Email,Invite URL', ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'chamber-bingo-invites.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      if (!isExpectedError(err)) console.error('Mail merge failed:', err);
      setSaveError(errorMessage(err, 'Could not build the invite list.'));
    } finally {
      setExporting(false);
    }
  };

  const inputClass = 'w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none transition-all';
  const labelClass = 'flex items-center gap-1.5 text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-8">
        {towns.length === 0 && (
          <div role="alert" className="bg-white border-2 border-[var(--color-primary)] rounded-3xl p-6 flex items-start gap-4">
            <AlertTriangle className="text-[var(--color-primary)] shrink-0 mt-0.5" size={18} aria-hidden="true" />
            <div>
              <p className="font-bold text-sm mb-1">Add a town first</p>
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                Every business belongs to a town, and boards are built mostly from
                businesses in the player&rsquo;s own town. Add your towns on the Setup tab,
                then come back here.
              </p>
            </div>
          </div>
        )}

        <div className="bg-white border border-neutral-200 p-6 rounded-3xl shadow-sm">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="bg-neutral-100 p-2 rounded-xl">
                <Store className="text-neutral-900" size={20} aria-hidden="true" />
              </div>
              <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Participating Businesses</h3>
            </div>
            <span className="text-[10px] bg-neutral-100 px-3 py-1 rounded-full font-bold text-neutral-600 uppercase tracking-widest">
              {businesses.length} Total
            </span>
          </div>
          <p className="text-sm text-neutral-500 leading-relaxed mb-6">
            The shops on the board. Each one gets its own poster with a code that
            only works at that shop.
          </p>

          {shortfall > 0 && (
            <div role="status" className="mb-6 bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4">
              <p className="text-xs font-bold text-orange-900 mb-1">
                {shortfall} more business{shortfall === 1 ? '' : 'es'} needed
              </p>
              <p className="text-[11px] text-orange-800 leading-relaxed">
                A {boardSize}x{boardSize} board fills {needed} squares plus a free space.
                Until you reach {needed}, players cannot be given a board at all. Add more
                businesses, or drop the board size on the Game tab.
              </p>
            </div>
          )}

          {saveError && (
            <div role="alert" className="mb-6 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
              <p className="text-red-600 text-xs font-bold">{saveError}</p>
            </div>
          )}

          <CSVImport onComplete={() => {}} categories={categories} />

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-neutral-200 rounded-2xl p-5">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">
                <Printer size={12} aria-hidden="true" /> Posters
              </p>
              <p className="text-[11px] text-neutral-500 leading-relaxed mb-4">
                One printable page per business, with its QR code, the task and
                instructions for the player. Print the set and deliver them before
                opening day.
              </p>
              <button
                onClick={printAllPosters}
                disabled={businesses.length === 0 || posterBusy !== null}
                className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest disabled:opacity-40 hover:bg-neutral-800 transition-all"
              >
                {posterBusy === 'all'
                  ? <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  : <Printer size={13} aria-hidden="true" />}
                {posterBusy === 'all' ? 'Loading codes...' : `Print all ${businesses.length}`}
              </button>
            </div>

            <div className="border border-neutral-200 rounded-2xl p-5">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">
                <Mail size={12} aria-hidden="true" /> Mail merge
              </p>
              <p className="text-[11px] text-neutral-500 leading-relaxed mb-4">
                A spreadsheet of one-time sign-in links, one per business with an email
                on file. <span className="font-bold text-neutral-700">Links expire 48 hours
                after you export</span>, so download this on the day you actually send
                the email.
              </p>
              <button
                onClick={exportMailMerge}
                disabled={exporting || withEmail.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest disabled:opacity-40 hover:bg-neutral-800 transition-all"
              >
                <Download size={13} aria-hidden="true" />
                {exporting ? 'Building...' : `Export ${withEmail.length} invite${withEmail.length === 1 ? '' : 's'}`}
              </button>
              {withEmail.length < businesses.length && (
                <p className="text-[10px] text-neutral-400 mt-2 leading-relaxed">
                  {businesses.length - withEmail.length} business
                  {businesses.length - withEmail.length === 1 ? ' has' : 'es have'} no email
                  and will be left out.
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3 bg-neutral-50 border border-neutral-100 rounded-2xl px-4 py-3">
            <Search size={16} className="text-neutral-400 shrink-0" aria-hidden="true" />
            <label htmlFor="biz-search" className="sr-only">Search businesses</label>
            <input
              id="biz-search"
              type="text"
              placeholder="Search by name, town, category, or task..."
              value={bizSearch}
              onChange={e => { setBizSearch(e.target.value); setBizPage(0); }}
              className="flex-1 bg-transparent text-sm outline-none font-medium placeholder:text-neutral-500"
            />
            {bizSearch && (
              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest shrink-0">
                {filteredBusinesses.length} result{filteredBusinesses.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {businesses.length === 0 ? (
            <div className="text-center py-14 mt-6 border border-dashed border-neutral-200 rounded-2xl">
              <Store className="mx-auto text-neutral-200 mb-3" size={40} aria-hidden="true" />
              <p className="text-sm text-neutral-500 font-medium">No businesses yet.</p>
              <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto leading-relaxed">
                Import a spreadsheet above, or fill in the Add Business form to the right.
                You need {needed} for a {boardSize}x{boardSize} board.
              </p>
            </div>
          ) : (
            <div className="mt-6 divide-y divide-neutral-100">
              {pagedBusinesses.map(biz => (
                <div key={biz.id} className="flex items-center justify-between py-3 px-4 hover:bg-neutral-50 transition-all rounded-2xl">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-neutral-900 truncate">{biz.name}</p>
                    <p className="text-xs text-neutral-400 truncate">
                      {biz.town} &bull; {biz.category || 'Uncategorised'}
                      {!biz.email?.trim() && <span className="text-orange-600"> &bull; no email</span>}
                      {!biz.lat && <span className="text-orange-600"> &bull; not on the map</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <button
                      onClick={() => editBusiness(biz)}
                      className="p-2 bg-white border border-neutral-200 rounded-xl text-neutral-400 hover:text-neutral-900 hover:border-neutral-900 transition-all shadow-sm"
                      title={`Edit ${biz.name}`}
                      aria-label={`Edit ${biz.name}`}
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => showPosterFor(biz)}
                      disabled={posterBusy !== null}
                      className="p-2 bg-white border border-neutral-200 rounded-xl text-neutral-400 hover:text-neutral-900 hover:border-neutral-900 transition-all shadow-sm disabled:opacity-40"
                      title={`Print the poster for ${biz.name}`}
                      aria-label={`Print the poster for ${biz.name}`}
                    >
                      {posterBusy === biz.id
                        ? <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                        : <QrCode size={15} aria-hidden="true" />}
                    </button>
                    <ConfirmButton
                      title={`Delete ${biz.name}?`}
                      body="Any player who already has this shop on their board keeps an unfillable square, and its visits stay in Reports. If the shop has just pulled out mid-season, tell players instead of deleting."
                      ariaLabel={`Delete ${biz.name}`}
                      onConfirm={() => deleteDoc(doc(db, 'businesses', biz.id))}
                      className="p-2 bg-white border border-neutral-200 rounded-xl text-neutral-500 hover:text-red-500 hover:border-red-200 transition-all shadow-sm"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </ConfirmButton>
                  </div>
                </div>
              ))}
            </div>
          )}

          {bizPageCount > 1 && (
            <div className="flex items-center justify-between mt-6 pt-6 border-t border-neutral-100">
              <button
                onClick={() => setBizPage(p => Math.max(0, p - 1))}
                disabled={bizPage === 0}
                className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={14} aria-hidden="true" /> Prev
              </button>
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                Page {bizPage + 1} of {bizPageCount}
              </span>
              <button
                onClick={() => setBizPage(p => Math.min(bizPageCount - 1, p + 1))}
                disabled={bizPage >= bizPageCount - 1}
                className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-colors"
              >
                Next <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add / edit form */}
      <div className="space-y-8">
        <div ref={formRef} className="bg-white border border-neutral-200 rounded-3xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">
              {editingId ? 'Edit Business' : 'Add a Business'}
            </h3>
            {editingId && (
              <button
                onClick={resetForm}
                className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 hover:text-neutral-900"
              >
                Cancel
              </button>
            )}
          </div>
          <p className="text-[11px] text-neutral-500 leading-relaxed mb-6">
            {editingId
              ? 'Changes take effect immediately, including for players who already have this shop on their board.'
              : 'Name, address, town and task are required. Everything else can be filled in later.'}
          </p>

          {formError && (
            <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
              <p className="text-red-600 text-xs font-bold leading-relaxed">{formError}</p>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label htmlFor="biz-name" className={labelClass}>Business Name</label>
              <input
                id="biz-name"
                placeholder="e.g. Main Street Bakery"
                value={newBiz.name}
                onChange={e => setNewBiz({ ...newBiz, name: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <span className={labelClass}>
                Location Search
                <HelpTip label="location search" align="right">
                  <p>Start typing the street address and pick a suggestion. That sets the exact map pin.</p>
                  <p>The pin matters: a player has to be within about 500 metres of it for a check-in to count. A shop pinned to the wrong side of town cannot be visited.</p>
                </HelpTip>
              </span>
              <AddressSearch onSelect={(lat, lng, address) => setNewBiz({ ...newBiz, lat, lng, address })} />
              {newBiz.address && (
                <p className="text-[11px] text-neutral-500 mt-2 leading-relaxed">
                  {newBiz.lat
                    ? <>Pinned to <span className="font-bold text-neutral-700">{newBiz.address}</span></>
                    : <span className="text-orange-600 font-bold">Not pinned yet. Pick a suggestion from the list.</span>}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="biz-town" className={labelClass}>Town</label>
                <select
                  id="biz-town"
                  value={selectedTown}
                  onChange={e => setNewBiz({ ...newBiz, town: e.target.value })}
                  className={inputClass}
                >
                  {towns.length === 0 && <option value="">No towns yet</option>}
                  {towns.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <span className={labelClass}>
                  NFC ID
                  <HelpTip label="the NFC ID" align="right">
                    <p>Optional. Only fill this in if you are also putting a programmable NFC sticker on the counter alongside the poster.</p>
                    <p>It is the serial printed on the tag, or whatever your tag writer reports. Leave it blank and the QR code still works fine on its own.</p>
                  </HelpTip>
                </span>
                <div className="flex items-center gap-3 px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl focus-within:ring-2 focus-within:ring-[var(--color-primary)] transition-all">
                  <Nfc size={16} className="text-neutral-400" aria-hidden="true" />
                  <input
                    aria-label="NFC ID"
                    placeholder="Optional"
                    value={newBiz.nfcId}
                    onChange={e => setNewBiz({ ...newBiz, nfcId: e.target.value })}
                    className="flex-1 bg-transparent outline-none text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="biz-category" className={labelClass}>Business Category</label>
              <select
                id="biz-category"
                value={newBiz.category}
                onChange={e => setNewBiz({ ...newBiz, category: e.target.value })}
                className={inputClass}
              >
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            <div>
              <span className={labelClass}>
                Task
                <HelpTip label="the task" align="right">
                  <p>What the player does at the shop. It prints on the poster and shows on their board.</p>
                  <p>Keep it to something a member of staff can see happening: &ldquo;Buy a coffee&rdquo;, &ldquo;Ask for the bingo stamp&rdquo;, &ldquo;Try a sample&rdquo;. Avoid anything that needs the owner to be there in person.</p>
                </HelpTip>
              </span>
              <input
                aria-label="Task"
                placeholder="e.g. Buy a coffee and say hello"
                value={newBiz.task}
                onChange={e => setNewBiz({ ...newBiz, task: e.target.value })}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="biz-desc" className={labelClass}>About Business (Optional)</label>
              <textarea
                id="biz-desc"
                placeholder="Brief description of the business..."
                value={newBiz.description}
                onChange={e => setNewBiz({ ...newBiz, description: e.target.value })}
                className={`${inputClass} h-24 resize-none`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="biz-image" className={labelClass}>Image URL (Optional)</label>
                <input
                  id="biz-image"
                  placeholder="https://..."
                  value={newBiz.image}
                  onChange={e => setNewBiz({ ...newBiz, image: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="biz-website" className={labelClass}>Website (Optional)</label>
                <input
                  id="biz-website"
                  placeholder="https://..."
                  value={newBiz.website}
                  onChange={e => setNewBiz({ ...newBiz, website: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <span className={labelClass}>
                  Contact Email (Optional)
                  <HelpTip label="the contact email" align="right">
                    <p>The owner or manager who should get a sign-in link for this shop.</p>
                    <p>Only businesses with an email here appear in the Mail Merge export, which is how owners get their own login to see who visited.</p>
                  </HelpTip>
                </span>
                <input
                  type="email"
                  aria-label="Contact email"
                  placeholder="owner@business.com"
                  value={newBiz.email}
                  onChange={e => setNewBiz({ ...newBiz, email: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <button
              onClick={addBusiness}
              disabled={isGeocoding || towns.length === 0}
              className="w-full bg-neutral-900 text-white p-5 rounded-2xl font-bold hover:bg-neutral-800 transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isGeocoding && <Loader2 className="animate-spin" size={18} aria-hidden="true" />}
              {isGeocoding ? 'Finding the address...' : editingId ? 'Update Business' : 'Add Business'}
            </button>
          </div>
        </div>
      </div>

      {posters && (
        <PosterModal posters={posters} settings={settings} onClose={() => setPosters(null)} />
      )}
    </div>
  );
};
