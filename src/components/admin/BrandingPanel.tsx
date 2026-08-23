import React, { useState, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { AppSettings } from '../../types';
import { Palette, ImagePlus, Loader2 } from 'lucide-react';
import { HelpTip } from './HelpTip';

const DEFAULT_PRIMARY = '#1695B2';
const DEFAULT_ACCENT = '#CC5500';

interface BrandingPanelProps {
  settings: AppSettings;
}

export const BrandingPanel: React.FC<BrandingPanelProps> = ({ settings }) => {
  const [logoUploading, setLogoUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const updateSettings = async (field: keyof AppSettings, value: unknown) => {
    await setDoc(doc(db, 'settings', 'global'), { [field]: value }, { merge: true });
  };

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    setUploadError(null);
    try {
      const storageRef = ref(storage, 'branding/chamber-logo');
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateSettings('chamberLogoUrl', url);
    } catch (err) {
      console.error('Logo upload failed:', err);
      setUploadError('That logo could not be uploaded. Try a PNG or JPG under 5 MB.');
    } finally {
      setLogoUploading(false);
    }
  };

  return (
    <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-neutral-100 p-2 rounded-xl">
          <Palette className="text-neutral-900" size={20} aria-hidden="true" />
        </div>
        <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Branding</h3>
      </div>
      <p className="text-sm text-neutral-500 leading-relaxed mb-8">
        How the app looks to players. Set this once. Changes save as you make them
        and appear for everyone within a few seconds.
      </p>

      {uploadError && (
        <div role="alert" className="mb-6 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <p className="text-red-600 text-xs font-bold">{uploadError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-1.5 text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
            Chamber Logo
            <HelpTip label="the chamber logo">
              <p>Shown on the sign-in screen, in the app header and on the printed posters.</p>
              <p>A wide PNG with a transparent background works best. It is scaled to about 48 pixels tall, so fine print will not be readable.</p>
            </HelpTip>
          </span>
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            aria-label="Upload a chamber logo"
            className="relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-neutral-200 p-6 cursor-pointer hover:border-neutral-400 transition-all bg-neutral-50 w-full focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-primary)]"
          >
            {logoUploading ? (
              <Loader2 className="animate-spin text-neutral-400" size={24} aria-hidden="true" />
            ) : settings.chamberLogoUrl ? (
              <img src={settings.chamberLogoUrl} alt="Current chamber logo" className="h-12 w-auto object-contain" />
            ) : (
              <ImagePlus className="text-neutral-500" size={24} aria-hidden="true" />
            )}
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              {settings.chamberLogoUrl ? 'Replace' : 'Upload Logo'}
            </span>
          </button>
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

        <div>
          <label htmlFor="chamber-name" className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">
            Chamber Name
          </label>
          <input
            id="chamber-name"
            defaultValue={settings.chamberName || ''}
            onBlur={e => {
              if (e.target.value !== (settings.chamberName || '')) updateSettings('chamberName', e.target.value);
            }}
            placeholder="Hudson Valley Gateway Chamber of Commerce"
            className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
          />
          <p className="text-[11px] text-neutral-500 mt-2 leading-relaxed">
            Shown in the app footer and during player sign-up. Saves when you click away.
          </p>
        </div>

        <div>
          <span className="flex items-center gap-1.5 text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">
            Primary Color
            <HelpTip label="the primary color">
              <p>Buttons, links and the header. Use your chamber&rsquo;s main brand color.</p>
              <p>Pick something dark enough that white text on top of it is readable.</p>
            </HelpTip>
          </span>
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label="Primary color picker"
              value={settings.primaryColor || DEFAULT_PRIMARY}
              onChange={e => updateSettings('primaryColor', e.target.value)}
              className="w-14 h-14 rounded-2xl border border-neutral-100 cursor-pointer bg-neutral-50 p-1"
            />
            <div className="flex-1">
              <input
                type="text"
                aria-label="Primary color hex code"
                value={settings.primaryColor || DEFAULT_PRIMARY}
                onChange={e => {
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) updateSettings('primaryColor', e.target.value);
                }}
                className="w-full p-3 bg-neutral-50 border border-neutral-100 rounded-xl text-sm font-mono font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none uppercase"
                maxLength={7}
              />
              <p className="text-[10px] text-neutral-400 mt-1 font-bold uppercase tracking-widest">Buttons, accents, links</p>
            </div>
          </div>
        </div>

        <div>
          <span className="flex items-center gap-1.5 text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">
            Accent Color
            <HelpTip label="the accent color" align="right">
              <p>The second color: the free space on the board, prize callouts and the notification dot.</p>
              <p>It should contrast with the primary color rather than sit next to it on the color wheel.</p>
            </HelpTip>
          </span>
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label="Accent color picker"
              value={settings.accentColor || DEFAULT_ACCENT}
              onChange={e => updateSettings('accentColor', e.target.value)}
              className="w-14 h-14 rounded-2xl border border-neutral-100 cursor-pointer bg-neutral-50 p-1"
            />
            <div className="flex-1">
              <input
                type="text"
                aria-label="Accent color hex code"
                value={settings.accentColor || DEFAULT_ACCENT}
                onChange={e => {
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) updateSettings('accentColor', e.target.value);
                }}
                className="w-full p-3 bg-neutral-50 border border-neutral-100 rounded-xl text-sm font-mono font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none uppercase"
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
        <p className="text-[11px] text-neutral-500 font-medium">
          Color changes apply instantly, for players who already have the app open too.
        </p>
      </div>
    </div>
  );
};
