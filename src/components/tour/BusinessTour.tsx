import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, QrCode, Printer, Users, CheckCircle2 } from 'lucide-react';
import { TourModal, TourStep } from './TourModal';

interface BusinessTourProps {
  businessName?: string;
  onComplete: () => void;
}

const STEPS: (TourStep & { route: string })[] = [
  {
    iconBg: 'var(--color-primary)',
    icon: <Store className="text-white" size={28} />,
    label: 'Business Owner',
    title: 'Welcome to your store dashboard',
    body: "Your business is part of Chamber Bingo. Players will visit you to complete tasks on their bingo board. This is your home base.",
    route: '/business',
  },
  {
    iconBg: '#171717',
    icon: <QrCode className="text-white" size={28} />,
    label: 'Your QR Code',
    title: 'This is how players check in',
    body: "Your unique QR code is here on this page. When a player visits and completes their task, they scan it to verify. The code is permanent -- set it up once and you're done.",
    route: '/business',
  },
  {
    iconBg: 'var(--color-accent)',
    icon: <Printer className="text-white" size={28} />,
    label: 'Print & Display',
    title: 'Put it somewhere visible',
    body: "Use Print to get a ready-to-display poster, or Save to download a PNG. Place it at your checkout counter or front desk where customers naturally pause.",
    route: '/business',
  },
  {
    iconBg: '#16a34a',
    icon: <Users className="text-white" size={28} />,
    label: 'Visitor Stats',
    title: 'See who visited',
    body: "Your dashboard shows total visitors and a live activity feed with each player's name and check-in time -- great for tracking foot traffic during the campaign.",
    route: '/business',
  },
  {
    iconBg: '#7c3aed',
    icon: <CheckCircle2 className="text-white" size={28} />,
    label: "You're all set",
    title: 'Ready to go',
    body: "That's everything. Your QR code is below -- print it out and you're ready to start welcoming bingo players. Contact your Chamber administrator if you need help.",
    route: '/business',
  },
];

export const BusinessTour: React.FC<BusinessTourProps> = ({ businessName, onComplete }) => {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const steps = businessName
    ? [{ ...STEPS[0], body: `${businessName} is part of Chamber Bingo. Players will visit you to complete tasks on their bingo board. This is your home base.` }, ...STEPS.slice(1)]
    : STEPS;

  useEffect(() => {
    navigate(steps[step].route);
  }, [step]);

  const handleDone = () => {
    navigate('/business');
    onComplete();
  };

  const handleSkip = () => {
    navigate('/business');
    onComplete();
  };

  return (
    <TourModal
      steps={steps}
      currentStep={step}
      onNext={() => setStep(s => s + 1)}
      onBack={() => setStep(s => s - 1)}
      onSkip={handleSkip}
      onDone={handleDone}
    />
  );
};
