import React, { useState } from 'react';
import Papa from 'papaparse';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { provisionBusinessCode, setBusinessNfc, setBusinessLoginEmail, errorMessage } from '../services/api';
import { newDocId } from '../lib/utils';
import { geocodeAddress } from '../lib/geocoding';
import { decodeCsvBytes, normalizeHeader, rowsFromRecords, matchTown, cleanText, ImportRow, RowIssue } from '../lib/businessImport';
import { Business, Town } from '../types';
import { Upload, CheckCircle2, Loader2, AlertCircle, Download, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CSVImportProps {
  businesses: Business[];
  towns: Town[];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const CSV_COLUMNS = [
  'name', 'address', 'town', 'task', 'website', 'contact_email', 'login_email',
  'phone', 'category', 'description', 'image',
];

const SAMPLE_CSV = [
  CSV_COLUMNS,
  ['The Coffee Spot', '123 Main St, Peekskill, NY 10566', 'Peekskill', 'Buy a coffee or pastry', 'www.thecoffeespot.com',
    'info@thecoffeespot.com', 'owner@thecoffeespot.com', '914-555-0100', 'Restaurant', 'Your neighborhood coffee shop on Main Street.', ''],
  ['Online Shop Example', 'ONLINE', '', 'Place an order online', 'https://example.com',
    'hello@example.com', 'hello@example.com', '', 'Retail', 'Write ONLINE as the address for a business with no storefront.', ''],
].map(row => row.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');

const downloadSample = () => {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chamber_businesses_sample.csv';
  a.click();
  URL.revokeObjectURL(url);
};

interface Preview {
  fileName: string;
  rows: ImportRow[];
  issues: RowIssue[];
  /** Rows whose name is already in the app. Skipped so a second upload does not double them. */
  duplicates: ImportRow[];
  newTowns: string[];
}

interface Result {
  imported: number;
  /** Has an address that could not be placed: no map pin and no distance check until fixed. */
  unplaced: string[];
  online: string[];
  failed: { name: string; reason: string }[];
}

const key = (s: string) => cleanText(s).toLowerCase();

export const CSVImport: React.FC<CSVImportProps> = ({ businesses, towns }) => {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const text = decodeCsvBytes(await file.arrayBuffer());
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: normalizeHeader,
      });
      if (!parsed.meta.fields?.includes('name')) {
        setError('That file has no "name" column. Download the sample CSV to see the columns.');
        return;
      }
      const { rows, issues } = rowsFromRecords(parsed.data);
      const existingNames = new Set(businesses.map(b => key(b.name)));
      const townNames = towns.map(t => t.name);
      const newTowns = [...new Set(rows.map(r => r.town).filter(t => t && !matchTown(t, townNames)))];
      setPreview({
        fileName: file.name,
        rows: rows.filter(r => !existingNames.has(key(r.name))),
        duplicates: rows.filter(r => existingNames.has(key(r.name))),
        issues,
        newTowns,
      });
    } catch (err) {
      console.error(err);
      setError('Could not read that file. Save it as CSV and try again.');
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    const { rows, newTowns } = preview;
    setError(null);
    const out: Result = { imported: 0, unplaced: [], online: [], failed: [] };

    try {
      for (const name of newTowns) {
        setProgress(`Adding town ${name}...`);
        await addDoc(collection(db, 'towns'), { name });
      }
    } catch (err) {
      console.error(err);
      setProgress(null);
      setError('Could not add the new towns, so nothing was imported. Try again.');
      return;
    }

    const townNames = [...towns.map(t => t.name), ...newTowns];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      setProgress(`Adding ${i + 1} of ${rows.length}: ${row.name}`);
      try {
        let lat = 0;
        let lng = 0;
        if (!row.online && row.address) {
          const coords = await geocodeAddress(row.address);
          if (coords) ({ lat, lng } = coords);
          else out.unplaced.push(row.name);
          await sleep(1100); // Nominatim allows one request per second
        }

        const id = newDocId();
        await setDoc(doc(db, 'businesses', id), {
          id,
          name: row.name,
          town: row.town ? (matchTown(row.town, townNames) ?? row.town) : '',
          task: row.task || 'Support Local!',
          address: row.address,
          lat,
          lng,
          description: row.description,
          image: row.image,
          website: row.website,
          email: row.contactEmail,
          phone: row.phone,
          category: row.category || 'Other',
          online: row.online,
        });

        // Codes, NFC serials and the owner's login email are all kept off the
        // public business document, which every player can read.
        await provisionBusinessCode({ businessId: id });
        if (row.loginEmail) await setBusinessLoginEmail({ businessId: id, loginEmail: row.loginEmail });
        if (row.nfcId) await setBusinessNfc({ businessId: id, nfcId: row.nfcId });

        if (row.online) out.online.push(row.name);
        out.imported++;
      } catch (err) {
        console.error(`Import failed for ${row.name}:`, err);
        out.failed.push({ name: row.name, reason: errorMessage(err, 'Could not be saved.') });
      }
    }

    setProgress(null);
    setPreview(null);
    setResult(out);
  };

  const busy = progress !== null;

  return (
    <div className="bg-neutral-50 p-8 rounded-[2rem] border border-neutral-100 shadow-inner">
      <div className="flex flex-col md:flex-row justify-between items-start gap-6">
        <div>
          <h4 className="font-bold uppercase tracking-widest text-xs mb-2">Bulk Import</h4>
          <p className="text-[10px] text-neutral-500 mb-3 max-w-md">
            Upload a CSV with columns: <span className="font-mono text-neutral-600">{CSV_COLUMNS.join(', ')}</span>.
            Only name is required. login_email stays private and is who the sign-up invite goes to.
          </p>
          <button
            onClick={downloadSample}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--color-primary)] hover:opacity-70 transition-opacity"
          >
            <Download size={12} />
            Download sample CSV
          </button>
        </div>

        {!preview && (
          <div className="relative w-full sm:w-auto">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              disabled={busy}
              aria-label="Choose a CSV file of businesses"
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
            />
            <div className="bg-white border border-neutral-200 px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-2 hover:border-neutral-900 hover:text-neutral-900 transition-all">
              <Upload size={14} />
              Choose CSV
            </div>
          </div>
        )}
      </div>

      {preview && (
        <div className="mt-6 bg-white border border-neutral-200 rounded-2xl p-5 space-y-4 text-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-bold text-neutral-900">
                {preview.rows.length} {preview.rows.length === 1 ? 'business' : 'businesses'} ready to add
              </p>
              <p className="text-xs text-neutral-500">{preview.fileName}</p>
            </div>
            {!busy && (
              <button onClick={() => setPreview(null)} aria-label="Cancel import"
                className="p-2 rounded-xl text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-all">
                <X size={16} />
              </button>
            )}
          </div>

          {preview.newTowns.length > 0 && (
            <p className="text-xs text-neutral-600">
              <span className="font-bold">New towns will be added:</span> {preview.newTowns.join(', ')}
            </p>
          )}

          {preview.duplicates.length > 0 && (
            <p className="text-xs text-neutral-600">
              <span className="font-bold">Already in the app, so skipped:</span> {preview.duplicates.map(r => r.name).join(', ')}
            </p>
          )}

          {preview.issues.length > 0 && (
            <div>
              <p className="text-xs font-bold text-orange-700 mb-1">Check these rows</p>
              <ul className="text-xs text-neutral-600 space-y-1 list-disc pl-5">
                {preview.issues.map((issue, i) => (
                  <li key={i}>Line {issue.line}{issue.name ? ` (${issue.name})` : ''}: {issue.message}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-neutral-500">
            Each address is looked up for the map, about one a second, so {preview.rows.length} businesses
            take around {Math.max(1, Math.ceil(preview.rows.length * 2 / 60))} minutes. Keep this tab open.
          </p>

          <button
            onClick={handleImport}
            disabled={busy || preview.rows.length === 0}
            className="w-full sm:w-auto bg-neutral-900 text-white px-8 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-800 transition-all disabled:opacity-50 shadow-lg flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="animate-spin" size={14} /> : `Import ${preview.rows.length}`}
          </button>
        </div>
      )}

      <AnimatePresence>
        {progress && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            role="status"
            className="mt-6 flex items-center gap-2 text-neutral-500 text-[10px] font-bold uppercase tracking-widest"
          >
            <Loader2 className="animate-spin" size={14} />
            {progress}
          </motion.div>
        )}
        {result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            role="status"
            className="mt-6 bg-white border border-neutral-200 rounded-2xl p-5 space-y-3 text-xs text-neutral-600"
          >
            <p className="flex items-center gap-2 text-green-700 font-bold text-sm">
              <CheckCircle2 size={16} />
              Added {result.imported} {result.imported === 1 ? 'business' : 'businesses'}
            </p>
            {result.unplaced.length > 0 && (
              <p>
                <span className="font-bold text-orange-700">No map pin yet:</span> {result.unplaced.join(', ')}.
                {' '}Their address could not be found, so the app cannot check that a player is there. Edit each one
                and pick the address from the suggestions.
              </p>
            )}
            {result.online.length > 0 && (
              <p>
                <span className="font-bold">Online only:</span> {result.online.join(', ')}. No map pin, and the code
                works from anywhere.
              </p>
            )}
            {result.failed.length > 0 && (
              <div>
                <p className="font-bold text-red-600">Not added, try these again:</p>
                <ul className="list-disc pl-5">
                  {result.failed.map(f => <li key={f.name}>{f.name}: {f.reason}</li>)}
                </ul>
              </div>
            )}
            <button onClick={() => setResult(null)}
              className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-900">
              Dismiss
            </button>
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            role="alert"
            className="mt-6 flex items-center gap-2 text-red-600 text-[10px] font-bold uppercase tracking-widest"
          >
            <AlertCircle size={14} />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
