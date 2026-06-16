import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface QRModalProps {
  isOpen: boolean;
  onClose: () => void;
  value: string;
  title: string;
}

export const QRModal: React.FC<QRModalProps> = ({ isOpen, onClose, value, title }) => {
  const downloadQR = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `${title.replace(/\s+/g, '_')}_QR.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="relative bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 hover:bg-neutral-100 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
            <h3 className="font-serif italic text-2xl mb-2">{title}</h3>
            <p className="text-xs text-neutral-500 mb-6 uppercase tracking-widest">Scan to verify visit</p>
            
            <div className="bg-white p-4 rounded-2xl border border-neutral-100 inline-block mb-6 shadow-inner">
              <QRCodeSVG
                id="qr-code-svg"
                value={value}
                size={200}
                level="H"
                includeMargin={true}
              />
            </div>

            <button
              onClick={downloadQR}
              className="w-full flex items-center justify-center gap-2 bg-neutral-900 text-white py-4 rounded-xl font-bold text-sm hover:bg-neutral-800 transition-all"
            >
              <Download size={18} />
              Download QR Code
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
