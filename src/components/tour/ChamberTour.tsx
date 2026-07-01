import React, { useState } from 'react';
import { Building2, Gamepad2, BarChart3, Users, ShieldCheck } from 'lucide-react';
import { TourModal, TourStep } from './TourModal';

interface ChamberTourProps {
  chamberName?: string;
  onComplete: () => void;
}

const STEPS: TourStep[] = [
  {
    iconBg: 'var(--color-primary)',
    icon: <ShieldCheck className="text-white" size={28} />,
    label: 'Chamber Staff',
    title: 'Welcome to your dashboard',
    body: "You have Chamber Manager access. You can control the game, manage businesses, view analytics, and invite participants. This quick tour will show you where everything lives.",
  },
  {
    iconBg: '#171717',
    icon: <Building2 className="text-white" size={28} />,
    label: 'Chamber Manager',
    title: 'Manage businesses & branding',
    body: "In the Chamber Manager tab you can add and edit businesses, upload your chamber logo, set your brand colors, manage raffle entries, and pick winners.",
  },
  {
    iconBg: 'var(--color-accent)',
    icon: <Gamepad2 className="text-white" size={28} />,
    label: 'Game Master',
    title: 'Control the game',
    body: "Use Game Master to set board size, difficulty, prizes, and raffle rules. You can also pause verification at any time -- useful for troubleshooting or end-of-season.",
  },
  {
    iconBg: '#7c3aed',
    icon: <BarChart3 className="text-white" size={28} />,
    label: 'Analytics',
    title: 'Track engagement',
    body: "The Analytics tab shows total players, visits, bingo finishers, a leaderboard, most visited businesses, and town distribution -- everything you need to report back to the Chamber board.",
  },
  {
    iconBg: '#0891b2',
    icon: <Users className="text-white" size={28} />,
    label: 'Users & Invites',
    title: 'Bring in your team',
    body: "In the Users tab you can manage player accounts, reset boards, and generate invite links for new Chamber staff or business owners. Invites expire after 48 hours.",
  },
];

export const ChamberTour: React.FC<ChamberTourProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);

  return (
    <TourModal
      steps={STEPS}
      currentStep={step}
      onNext={() => setStep(s => s + 1)}
      onBack={() => setStep(s => s - 1)}
      onSkip={onComplete}
      onDone={onComplete}
    />
  );
};
