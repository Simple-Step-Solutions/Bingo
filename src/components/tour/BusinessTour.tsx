import React, { useState } from 'react';
import { Store, QrCode, Printer, Users, CheckCircle2 } from 'lucide-react';
import { TourModal, TourStep } from './TourModal';

interface BusinessTourProps {
  businessName?: string;
  onComplete: () => void;
}

const STEPS: TourStep[] = [
  {
    iconBg: 'var(--color-primary)',
    icon: <Store className="text-white" size={28} />,
    label: 'Business Owner',
    title: 'Welcome to your store dashboard',
    body: "Your business is part of Chamber Bingo. Players will visit you to complete tasks on their bingo board. This tour shows you everything you need to get set up.",
  },
  {
    iconBg: '#171717',
    icon: <QrCode className="text-white" size={28} />,
    label: 'Your QR Code',
    title: 'This is how players check in',
    body: "Your unique QR code is shown on this page. When a player visits and completes their task, they scan it to verify their visit. The code is permanent -- you only need to set it up once.",
  },
  {
    iconBg: 'var(--color-accent)',
    icon: <Printer className="text-white" size={28} />,
    label: 'Print & Display',
    title: 'Put it somewhere visible',
    body: "Use the Print button to get a ready-to-display poster, or Save to download a PNG. Place it at your checkout counter, front desk, or wherever customers naturally pause.",
  },
  {
    iconBg: '#16a34a',
    icon: <Users className="text-white" size={28} />,
    label: 'Visitor Stats',
    title: 'See who visited',
    body: "Your dashboard shows total visitors and a live activity feed. You can see each player's name and when they checked in -- great for tracking foot traffic during the campaign.",
  },
  {
    iconBg: '#7c3aed',
    icon: <CheckCircle2 className="text-white" size={28} />,
    label: "You're all set",
    title: 'Ready to play along',
    body: "That's everything. If you ever need help, contact your Chamber administrator. You can replay this tour any time from your profile page.",
  },
];

export const BusinessTour: React.FC<BusinessTourProps> = ({ businessName, onComplete }) => {
  const [step, setStep] = useState(0);

  // Inject business name into first step if available
  const steps = businessName
    ? [{ ...STEPS[0], body: `${businessName} is part of Chamber Bingo. Players will visit you to complete tasks on their bingo board. This tour shows you everything you need to get set up.` }, ...STEPS.slice(1)]
    : STEPS;

  return (
    <TourModal
      steps={steps}
      currentStep={step}
      onNext={() => setStep(s => s + 1)}
      onBack={() => setStep(s => s - 1)}
      onSkip={onComplete}
      onDone={onComplete}
    />
  );
};
