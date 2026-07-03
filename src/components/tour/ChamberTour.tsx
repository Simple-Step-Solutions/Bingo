import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Gamepad2, BarChart3, Users, ShieldCheck } from 'lucide-react';
import { TourModal, TourStep } from './TourModal';

interface ChamberTourProps {
  chamberName?: string;
  onComplete: () => void;
}

const STEPS: (TourStep & { route: string })[] = [
  {
    iconBg: 'var(--color-primary)',
    icon: <ShieldCheck className="text-white" size={28} />,
    label: 'Chamber Staff',
    title: 'Welcome to your dashboard',
    body: "You have Chamber Manager access. You can control the game, manage businesses, view analytics, and invite participants. This tour will take you through each section.",
    route: '/',
  },
  {
    iconBg: '#171717',
    icon: <Building2 className="text-white" size={28} />,
    label: 'Chamber Manager',
    title: 'Manage businesses & branding',
    body: "Here you can add and edit participating businesses, upload your chamber logo, set brand colors, manage raffle entries, and pick winners.",
    route: '/admin?tab=chamber',
  },
  {
    iconBg: 'var(--color-accent)',
    icon: <Gamepad2 className="text-white" size={28} />,
    label: 'Game Master',
    title: 'Control the game',
    body: "Set board size, difficulty, prizes, and raffle rules. You can also pause verification at any time -- useful for troubleshooting or end-of-season.",
    route: '/admin?tab=master',
  },
  {
    iconBg: '#7c3aed',
    icon: <BarChart3 className="text-white" size={28} />,
    label: 'Analytics',
    title: 'Track engagement',
    body: "Total players, visits, bingo finishers, a leaderboard, most visited businesses, and town distribution -- everything you need to report back to the board.",
    route: '/admin?tab=analytics',
  },
  {
    iconBg: '#0891b2',
    icon: <Users className="text-white" size={28} />,
    label: 'Users & Invites',
    title: 'Bring in your team',
    body: "Manage player accounts, reset boards, and generate invite links for new Chamber staff or business owners. Invites expire after 48 hours.",
    route: '/admin?tab=admin',
  },
];

export const ChamberTour: React.FC<ChamberTourProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const route = STEPS[step].route;
    navigate(route);
  }, [step]);

  const handleDone = () => {
    navigate('/admin?tab=chamber');
    onComplete();
  };

  const handleSkip = () => {
    navigate('/admin?tab=chamber');
    onComplete();
  };

  return (
    <TourModal
      steps={STEPS}
      currentStep={step}
      onNext={() => setStep(s => s + 1)}
      onBack={() => setStep(s => s - 1)}
      onSkip={handleSkip}
      onDone={handleDone}
    />
  );
};
