import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Gamepad2, BarChart3, Users, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import { TourModal, TourStep } from './TourModal';

interface ChamberTourProps {
  chamberName?: string;
  onComplete: () => void;
}

/**
 * Walks the tabs in the order the work actually happens, which is the same
 * order the setup checklist uses. Somebody doing this alone for the first time
 * should finish the tour standing on the first thing they have to do.
 */
const STEPS: (TourStep & { route: string })[] = [
  {
    iconBg: 'var(--color-primary)',
    icon: <ShieldCheck className="text-white" size={28} />,
    label: 'Chamber Staff',
    title: 'You run the game from here',
    body: "Seven tabs, in the order you will need them. Nothing you do is hidden: every change is recorded, and the risky ones ask twice. Look for the small question marks next to any setting you are unsure about.",
    route: '/admin?tab=setup',
  },
  {
    iconBg: '#171717',
    icon: <Sparkles className="text-white" size={28} />,
    label: 'Setup',
    title: 'Start with the checklist',
    body: "The Setup tab opens with a checklist that fills itself in as you go, so you always know what is left. Underneath it are your logo, your colours and your towns. Add towns before businesses: boards are built from the player's own town first.",
    route: '/admin?tab=setup',
  },
  {
    iconBg: '#0891b2',
    icon: <Store className="text-white" size={28} />,
    label: 'Businesses',
    title: 'Add your member shops',
    body: "Import a spreadsheet or add them one at a time. Each shop gets its own code, and you can print a ready-made poster for every one of them in a single go. A 3x3 board needs 8 businesses before anyone can play.",
    route: '/admin?tab=businesses',
  },
  {
    iconBg: 'var(--color-accent)',
    icon: <Gamepad2 className="text-white" size={28} />,
    label: 'Game',
    title: 'Set the season and the rules',
    body: "A season holds the dates, the board size and the prizes. Give it a start and an end and the game opens and closes on its own. When a season is live it owns those settings, and the panel below it shows them as read-only so there is only ever one place to change them.",
    route: '/admin?tab=game',
  },
  {
    iconBg: '#ca8a04',
    icon: <Trophy className="text-white" size={28} />,
    label: 'Prizes',
    title: 'Draw winners and track handovers',
    body: "Everyone who finishes a board appears here by itself. Mark each one collected when you actually hand the prize over, so you always know who is still owed. The raffle draw is here too, and it records the pool size so a result can be shown to have been fair.",
    route: '/admin?tab=prizes',
  },
  {
    iconBg: '#7c3aed',
    icon: <BarChart3 className="text-white" size={28} />,
    label: 'Reports',
    title: 'Numbers for your board meeting',
    body: "Players, visits, finishers, a leaderboard, the busiest shops and the busiest time of day. This is the foot-traffic evidence that sells renewals to your members.",
    route: '/admin?tab=reports',
  },
  {
    iconBg: '#0f766e',
    icon: <Users className="text-white" size={28} />,
    label: 'People and Activity',
    title: 'Accounts, and a record of everything',
    body: "Invite your staff and shop owners on the People tab. Invite links expire after 48 hours, so send them the day you make them. The Activity tab keeps a plain-language history of every change, plus a check you can run before handing out prizes.",
    route: '/admin?tab=people',
  },
];

export const ChamberTour: React.FC<ChamberTourProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    navigate(STEPS[step].route);
  }, [step, navigate]);

  const finish = () => {
    navigate('/admin?tab=setup');
    onComplete();
  };

  return (
    <TourModal
      steps={STEPS}
      currentStep={step}
      onNext={() => setStep(s => s + 1)}
      onBack={() => setStep(s => s - 1)}
      onSkip={finish}
      onDone={finish}
    />
  );
};
