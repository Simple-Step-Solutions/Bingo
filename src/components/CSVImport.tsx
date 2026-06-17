import React, { useState } from 'react';
import Papa from 'papaparse';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Upload, CheckCircle2, Loader2, AlertCircle, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CSVImportProps {
  onComplete: () => void;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'ChamberBingo/1.0' } }
    );
    const data = await res.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.error('Geocoding failed for:', address, err);
  }
  return null;
}

const SAMPLE_CSV = [
  ['name', 'town', 'task', 'address', 'description', 'website', 'nfcId'],
  ['"The Coffee Spot"', '"Peekskill"', '"Buy a coffee or pastry and ask for a stamp"', '"123 Main St, Peekskill, NY 10566"', '"Your neighborhood coffee shop on Main Street."', '"https://thecoffeespot.com"', '""'],
  ['"River Books"', '"Peekskill"', '"Browse the shelves and buy a book or bookmark"', '"456 Water St, Peekskill, NY 10566"', '"Independent bookstore with curated local selections."', '""', '""'],
].map(row => row.join(',')).join('\n');

const downloadSample = () => {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chamber_businesses_sample.csv';
  a.click();
  URL.revokeObjectURL(url);
};

export const CSVImport: React.FC<CSVImportProps> = ({ onComplete }) => {
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleImport = () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    setGeocodeStatus(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          const total = rows.length;

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const id = Math.random().toString(36).substr(2, 9);

            let lat = 0;
            let lng = 0;
            const address = (row.address || '').trim();
            if (address) {
              setGeocodeStatus(`Looking up address ${i + 1} of ${total}...`);
              const coords = await geocodeAddress(address);
              if (coords) { lat = coords.lat; lng = coords.lng; }
              // Nominatim requires max 1 req/sec
              if (i < rows.length - 1) await sleep(1100);
            }

            await setDoc(doc(db, 'businesses', id), {
              id,
              name: row.name || 'Unknown',
              town: row.town || '',
              task: row.task || 'Support Local!',
              qrCode: `CHAMBER_${id}`,
              address,
              lat,
              lng,
              nfcId: row.nfcId || '',
              description: row.description || '',
              image: row.image || '',
              website: row.website || '',
            });
          }

          setGeocodeStatus(null);
          setSuccess(true);
          setFile(null);
          onComplete();
          setTimeout(() => setSuccess(false), 5000);
        } catch (err) {
          console.error(err);
          setGeocodeStatus(null);
          setError('Failed to import businesses. Check CSV format.');
        } finally {
          setImporting(false);
        }
      },
      error: (err) => {
        console.error(err);
        setError('Error parsing CSV file.');
        setImporting(false);
      },
    });
  };

  return (
    <div className="bg-neutral-50 p-8 rounded-[2rem] border border-neutral-100 shadow-inner">
      <div className="flex flex-col md:flex-row justify-between items-start gap-6">
        <div>
          <h4 className="font-bold uppercase tracking-widest text-xs mb-2">Bulk Import</h4>
          <p className="text-[10px] text-neutral-400 italic mb-3">
            Upload a CSV with columns: <span className="font-mono not-italic text-neutral-500">name, town, task, address, description, website, nfcId</span>
          </p>
          <button
            onClick={downloadSample}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--color-primary)] hover:opacity-70 transition-opacity"
          >
            <Download size={12} />
            Download sample CSV
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-center w-full md:w-auto">
          <div className="relative w-full sm:w-auto">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
            />
            <div className="bg-white border border-neutral-200 px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2 hover:border-neutral-900 hover:text-neutral-900 transition-all">
              <Upload size={14} />
              {file ? file.name : 'Choose CSV'}
            </div>
          </div>

          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="w-full sm:w-auto bg-neutral-900 text-white px-8 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-800 transition-all disabled:opacity-50 shadow-lg flex items-center justify-center gap-2"
          >
            {importing ? <Loader2 className="animate-spin" size={14} /> : 'Import'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {geocodeStatus && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6 flex items-center gap-2 text-neutral-500 text-[10px] font-bold uppercase tracking-widest"
          >
            <Loader2 className="animate-spin" size={14} />
            {geocodeStatus}
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6 flex items-center gap-2 text-green-600 text-[10px] font-bold uppercase tracking-widest"
          >
            <CheckCircle2 size={14} />
            Import successful!
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
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
