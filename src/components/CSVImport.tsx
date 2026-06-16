import React, { useState } from 'react';
import Papa from 'papaparse';
import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Upload, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CSVImportProps {
  onComplete: () => void;
}

export const CSVImport: React.FC<CSVImportProps> = ({ onComplete }) => {
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const batch = results.data.map(async (row: any) => {
            const id = Math.random().toString(36).substr(2, 9);
            await setDoc(doc(db, 'businesses', id), {
              id,
              name: row.name || 'Unknown',
              town: row.town || 'Yorktown',
              task: row.task || 'Support Local!',
              qrCode: `CHAMBER_${id}`,
              address: row.address || '',
              lat: parseFloat(row.lat) || 0,
              lng: parseFloat(row.lng) || 0,
              nfcId: row.nfcId || '',
              description: row.description || '',
              image: row.image || '',
              website: row.website || ''
            });
          });
          await Promise.all(batch);
          setSuccess(true);
          setFile(null);
          onComplete();
          setTimeout(() => setSuccess(false), 5000);
        } catch (err) {
          console.error(err);
          setError('Failed to import businesses. Check CSV format.');
        } finally {
          setImporting(false);
        }
      },
      error: (err) => {
        console.error(err);
        setError('Error parsing CSV file.');
        setImporting(false);
      }
    });
  };

  return (
    <div className="bg-neutral-50 p-8 rounded-[2rem] border border-neutral-100 shadow-inner">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h4 className="font-bold uppercase tracking-widest text-xs mb-2">Bulk Import</h4>
          <p className="text-[10px] text-neutral-400 italic">Upload a CSV with name, town, task, address, lat, lng, nfcId, description, image, website</p>
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
