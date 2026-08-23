import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer } from 'lucide-react';
import { AppSettings } from '../../types';

export interface PosterData {
  businessId: string;
  name: string;
  town?: string;
  task?: string;
  code: string;
}

interface PosterModalProps {
  posters: PosterData[];
  settings: AppSettings;
  onClose: () => void;
}

/**
 * The printable counter poster.
 *
 * This replaced a bare QR download: a PNG with no business name, no
 * instructions and no way to produce more than one at a time. The chamber has
 * to put a code in every member shop, so printing the whole set is the job,
 * and each poster has to stand alone on a counter without anyone there to
 * explain it.
 *
 * The code is printed as text under the QR on purpose. Players can type it in,
 * and a poster whose QR gets scuffed is otherwise dead. It is no more exposed
 * than the QR beside it, since the QR encodes exactly this string.
 */
export const PosterModal: React.FC<PosterModalProps> = ({ posters, settings, onClose }) => {
  useEffect(() => {
    document.body.classList.add('printing-posters');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('printing-posters');
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const chamber = settings.chamberName || 'Chamber of Commerce';

  // Rendered straight into <body> rather than inside the app root. The print
  // rule hides every top-level element except this one, and from inside #root
  // that rule would hide the posters along with the app.
  return createPortal(
    <div className="poster-print-root fixed inset-0 z-[90] bg-neutral-900/70 flex flex-col p-4 md:p-8">
      <div className="poster-screen-only flex flex-wrap items-center justify-between gap-4 mb-4 shrink-0">
        <div className="text-white">
          <p className="font-bold text-sm">
            {posters.length} poster{posters.length === 1 ? '' : 's'} ready
          </p>
          <p className="text-[11px] text-neutral-300 leading-relaxed max-w-xl">
            Each poster prints on its own page. Check your printer dialog is set to
            portrait with background graphics on, then deliver one to each shop.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-white text-neutral-900 hover:bg-neutral-100 transition-all"
          >
            <Printer size={14} aria-hidden="true" /> Print
          </button>
          <button
            onClick={onClose}
            aria-label="Close posters"
            className="p-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="poster-scroll flex-1 overflow-y-auto rounded-3xl bg-neutral-100 p-4 md:p-8 space-y-8">
        {posters.map(poster => (
          <div
            key={poster.businessId}
            className="poster-page bg-white mx-auto w-full max-w-[8.5in] aspect-[8.5/11] rounded-2xl shadow-lg flex flex-col items-center justify-between text-center px-10 py-12"
          >
            <div className="flex flex-col items-center gap-3">
              {settings.chamberLogoUrl && (
                <img src={settings.chamberLogoUrl} alt="" className="h-14 w-auto object-contain" />
              )}
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-neutral-400">
                {chamber}
              </p>
              <h1 className="font-serif italic text-5xl text-neutral-900 leading-tight">
                Chamber Bingo
              </h1>
            </div>

            <div className="flex flex-col items-center gap-5">
              <div className="border-4 border-neutral-900 rounded-3xl p-5">
                <QRCodeSVG value={poster.code} size={260} level="H" marginSize={2} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-neutral-400 mb-1">
                  Or type this code
                </p>
                <p className="font-mono text-2xl font-bold tracking-[0.2em] text-neutral-900">
                  {poster.code}
                </p>
              </div>
            </div>

            <div className="w-full">
              <p className="font-bold text-3xl text-neutral-900 leading-tight">{poster.name}</p>
              {poster.town && (
                <p className="text-sm font-bold uppercase tracking-widest text-neutral-400 mt-1">
                  {poster.town}
                </p>
              )}
              {poster.task && (
                <p className="text-lg text-neutral-600 italic mt-4 leading-snug">
                  &ldquo;{poster.task}&rdquo;
                </p>
              )}
              <div className="mt-8 border-t border-neutral-200 pt-5">
                <p className="text-base font-bold text-neutral-900">
                  Playing bingo? Scan this to check in.
                </p>
                <p className="text-sm text-neutral-500 leading-relaxed mt-1">
                  Open the Chamber Bingo app, tap Scan, and point your camera here.
                  You need to be at the shop for it to count.
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
};
