import React, { useState } from 'react';
import Papa from 'papaparse';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { provisionBusinessCode, setBusinessNfc } from '../services/api';
import { newDocId } from '../lib/utils';
import { geocodeAddress } from '../lib/geocoding';
import { Upload, CheckCircle2, Loader2, AlertCircle, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { HelpTip } from './admin/HelpTip';

interface CSVImportProps {
  onComplete: () => void;
  /** Offered in the sample file so imported rows land on categories that exist. */
  categories?: string[];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * category and email were missing from this list for a long time, and both
 * matter. Without category every imported business landed under "Other" in
 * Reports; without email none of them appeared in the Mail Merge export, so a
 * chamber that onboarded by spreadsheet could not invite a single owner without
 * editing all of them by hand first.
 */
const COLUMNS = ['name', 'town', 'task', 'address', 'category', 'email', 'description', 'website', 'nfcId'];

const SAMPLE_ROWS = [
  ['The Coffee Spot', 'Peekskill', 'Buy a coffee or pastry and ask for a stamp', '123 Main St, Peekskill, NY 10566', 'Restaurant', 'hello@thecoffeespot.com', 'Your neighborhood coffee shop on Main Street.', 'https://thecoffeespot.com', ''],
  ['River Books', 'Peekskill', 'Browse the shelves and buy a book or bookmark', '456 Water St, Peekskill, NY 10566', 'Retail', 'owner@riverbooks.com', 'Independent bookstore with curated local selections.', '', ''],
];

const buildSample = () =>
  [COLUMNS, ...SAMPLE_ROWS]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

const downloadSample = () => {
  const blob = new Blob([buildSample()], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chamber_businesses_sample.csv';
  a.click();
  URL.revokeObjectURL(url);
};

export const CSVImport: React.FC<CSVImportProps> = ({ onComplete, categories }) => {
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; unplaced: string[] } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      setError(null);
      setResult(null);
    }
  };

  const handleImport = () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    setResult(null);
    setStatus(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      // "Name" and " name" are what a spreadsheet actually produces.
      transformHeader: h => h.trim().toLowerCase(),
      complete: async (results) => {
        try {
          const rows = results.data.filter(r => (r.name || '').trim());
          if (rows.length === 0) {
            setError('No rows with a name column were found. Download the sample below and match its headings.');
            setImporting(false);
            return;
          }

          const unplaced: string[] = [];
          let added = 0;

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const id = newDocId();
            const name = (row.name || '').trim();

            let lat = 0;
            let lng = 0;
            const address = (row.address || '').trim();
            if (address) {
              setStatus(`Looking up address ${i + 1} of ${rows.length}...`);
              const coords = await geocodeAddress(address);
              if (coords) { lat = coords.lat; lng = coords.lng; }
              // Nominatim allows at most one request per second.
              if (i < rows.length - 1) await sleep(1100);
            }
            // A business with no map pin can never be checked in to, because the
            // radius test has nothing to measure against. Import it anyway so the
            // list is complete, but name it so it can be fixed by hand.
            if (!lat || !lng) unplaced.push(name);

            await setDoc(doc(db, 'businesses', id), {
              id,
              name,
              town: (row.town || '').trim(),
              task: (row.task || '').trim() || 'Support Local!',
              category: (row.category || '').trim() || 'Other',
              address,
              lat,
              lng,
              description: (row.description || '').trim(),
              image: (row.image || '').trim(),
              website: (row.website || '').trim(),
              email: (row.email || '').trim(),
            });

            // Codes and NFC serials are provisioned server-side and never
            // written into the public business document.
            await provisionBusinessCode({ businessId: id });
            if (row.nfcid) await setBusinessNfc({ businessId: id, nfcId: String(row.nfcid).trim() });
            added++;
          }

          setStatus(null);
          setResult({ added, unplaced });
          setFile(null);
          onComplete();
        } catch (err) {
          console.error(err);
          setStatus(null);
          setError('The import stopped partway through. Any businesses already added were kept, so check the list below before running it again.');
        } finally {
          setImporting(false);
        }
      },
      error: (err) => {
        console.error(err);
        setError('That file could not be read as a CSV. Export it from your spreadsheet as "CSV" rather than "Excel Workbook".');
        setImporting(false);
      },
    });
  };

  return (
    <div className="bg-neutral-50 p-8 rounded-[2rem] border border-neutral-100 shadow-inner">
      <div className="flex flex-col md:flex-row justify-between items-start gap-6">
        <div className="max-w-md">
          <h4 className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-xs mb-2">
            Bulk Import
            <HelpTip label="bulk import">
              <p>Adds many businesses at once from a spreadsheet. The quickest way to get started if you already keep a member list.</p>
              <p>The first row must be the column headings. Only <strong>name</strong> is required, but a row without an address cannot be checked in to until you add one.</p>
              <p>Importing always adds new entries. It never updates or removes what is already here, so running it twice gives you duplicates.</p>
            </HelpTip>
          </h4>
          <p className="text-[11px] text-neutral-500 leading-relaxed mb-2">
            Columns: <span className="font-mono text-neutral-700">{COLUMNS.join(', ')}</span>
          </p>
          <p className="text-[11px] text-neutral-500 leading-relaxed mb-3">
            Addresses are looked up one per second, so a list of 40 takes about a
            minute. Leave this tab open while it runs.
            {categories?.length ? (
              <> Use one of your categories: <span className="font-mono text-neutral-700">{categories.join(', ')}</span>.</>
            ) : null}
          </p>
          <button
            onClick={downloadSample}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--color-primary)] hover:opacity-70 transition-opacity"
          >
            <Download size={12} aria-hidden="true" />
            Download sample CSV
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-center w-full md:w-auto">
          <div className="relative w-full sm:w-auto">
            <input
              type="file"
              accept=".csv"
              aria-label="Choose a CSV file"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
            />
            <div className="bg-white border border-neutral-200 px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2 hover:border-neutral-900 hover:text-neutral-900 transition-all">
              <Upload size={14} aria-hidden="true" />
              {file ? file.name : 'Choose CSV'}
            </div>
          </div>

          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="w-full sm:w-auto bg-neutral-900 text-white px-8 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-800 transition-all disabled:opacity-50 shadow-lg flex items-center justify-center gap-2"
          >
            {importing ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : 'Import'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {status && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            role="status"
            className="mt-6 flex items-center gap-2 text-neutral-500 text-[10px] font-bold uppercase tracking-widest"
          >
            <Loader2 className="animate-spin" size={14} aria-hidden="true" />
            {status}
          </motion.div>
        )}
        {result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            role="status"
            className="mt-6"
          >
            <p className="flex items-center gap-2 text-green-600 text-[10px] font-bold uppercase tracking-widest">
              <CheckCircle2 size={14} aria-hidden="true" />
              {result.added} business{result.added === 1 ? '' : 'es'} imported
            </p>
            {result.unplaced.length > 0 && (
              <p className="text-[11px] text-orange-700 leading-relaxed mt-2">
                {result.unplaced.length} could not be placed on the map and cannot be
                checked in to until you edit them and pick an address suggestion:{' '}
                <span className="font-bold">{result.unplaced.slice(0, 6).join(', ')}</span>
                {result.unplaced.length > 6 && ` and ${result.unplaced.length - 6} more`}.
              </p>
            )}
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            role="alert"
            className="mt-6 flex items-start gap-2 text-red-600 text-[11px] font-bold leading-relaxed"
          >
            <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
