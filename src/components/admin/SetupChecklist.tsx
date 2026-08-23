import React from 'react';
import { AppSettings, Business, GameEvent, Town, UserProfile } from '../../types';
import { CheckCircle2, Circle, ArrowRight, Rocket, Printer, RotateCw, Mail } from 'lucide-react';
import { AdminTab } from './tabs';

interface SetupChecklistProps {
  settings: AppSettings;
  businesses: Business[];
  towns: Town[];
  users: UserProfile[];
  activeEvent: GameEvent | null;
  onGoTo: (tab: AdminTab) => void;
}

interface Step {
  title: string;
  detail: string;
  done: boolean;
  progress?: string;
  tab: AdminTab;
  cta: string;
}

/**
 * The order of operations, as state rather than documentation.
 *
 * The chamber sets this up once a year, without help, from a standing start.
 * Every step here is derived from real data instead of a stored "dismissed"
 * flag, so the list is always telling the truth about what is left, and it
 * disappears on its own when the game is genuinely ready to open.
 */
export const SetupChecklist: React.FC<SetupChecklistProps> = ({
  settings, businesses, towns, users, activeEvent, onGoTo,
}) => {
  const boardSize = activeEvent?.boardSize || settings.boardSize || 3;
  const needed = boardSize * boardSize - 1;
  const withEmail = businesses.filter(b => b.email?.trim()).length;
  const businessOwners = users.filter(u => u.role === 'business').length;
  const hasWindow = Boolean(activeEvent?.startsAt || activeEvent?.endsAt);

  const steps: Step[] = [
    {
      title: 'Add your logo and colors',
      detail: 'Players see these on the sign-in screen and on every poster.',
      done: Boolean(settings.chamberLogoUrl),
      tab: 'setup',
      cta: 'Open branding',
    },
    {
      title: 'Add your towns',
      detail: 'Boards are built mostly from businesses in the player’s own town, so towns come before businesses.',
      done: towns.length > 0,
      progress: `${towns.length} added`,
      tab: 'setup',
      cta: 'Add towns',
    },
    {
      title: 'Add participating businesses',
      detail: `A ${boardSize}x${boardSize} board needs ${needed} businesses before anyone can be given a board. Import a spreadsheet or add them one at a time.`,
      done: businesses.length >= needed,
      progress: `${businesses.length} of ${needed} needed`,
      tab: 'businesses',
      cta: 'Add businesses',
    },
    {
      title: 'Collect business contact emails',
      detail: 'The Mail Merge export can only invite businesses that have an email on file.',
      done: businesses.length > 0 && withEmail === businesses.length,
      progress: `${withEmail} of ${businesses.length} have one`,
      tab: 'businesses',
      cta: 'Review businesses',
    },
    {
      title: 'Create a season and set its dates',
      detail: 'The season decides when verification opens and closes, so you do not have to remember to switch the game off.',
      done: Boolean(activeEvent && hasWindow),
      progress: activeEvent
        ? (hasWindow ? activeEvent.name : `${activeEvent.name} has no dates yet`)
        : undefined,
      tab: 'game',
      cta: 'Set up the season',
    },
    {
      title: 'Invite your business owners',
      detail: 'Owners get their own sign-in so they can see who visited and show their code at the counter.',
      done: businessOwners > 0,
      progress: `${businessOwners} signed up`,
      tab: 'people',
      cta: 'Send invites',
    },
  ];

  const doneCount = steps.filter(s => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <div className="bg-white border-2 border-[var(--color-primary)] rounded-3xl p-8 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[var(--color-primary)] rounded-xl flex items-center justify-center shrink-0">
            <Rocket className="text-white" size={14} aria-hidden="true" />
          </div>
          <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-500">
            {allDone ? 'You are ready to open' : 'Getting started'}
          </h3>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          {doneCount} of {steps.length} done
        </span>
      </div>

      <p className="text-sm text-neutral-600 leading-relaxed mb-6">
        {allDone
          ? 'Everything the app can check is in place. The reminders below are the parts that happen off screen.'
          : 'Work down this list in order. It updates itself as you go, and disappears once the game is ready to open.'}
      </p>

      <div
        className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden mb-8"
        role="progressbar"
        aria-valuenow={doneCount}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-label="Setup progress"
      >
        <div
          className="h-full bg-[var(--color-primary)] transition-all duration-500"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <ol className="space-y-3 mb-8">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className={`flex flex-wrap items-start gap-4 rounded-2xl border p-4 ${
              step.done ? 'border-neutral-100 bg-neutral-50' : 'border-neutral-200 bg-white'
            }`}
          >
            {step.done
              ? <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={18} aria-hidden="true" />
              : <Circle className="text-neutral-300 shrink-0 mt-0.5" size={18} aria-hidden="true" />}

            <div className="min-w-0 flex-1">
              <p className={`text-sm font-bold ${step.done ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
                <span className="sr-only">{step.done ? 'Done: ' : `Step ${i + 1}, not done: `}</span>
                {step.title}
              </p>
              {!step.done && (
                <p className="text-[11px] text-neutral-500 leading-relaxed mt-1">{step.detail}</p>
              )}
              {step.progress && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mt-1.5">
                  {step.progress}
                </p>
              )}
            </div>

            {!step.done && (
              <button
                onClick={() => onGoTo(step.tab)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 transition-all"
              >
                {step.cta} <ArrowRight size={12} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ol>

      <div className="border-t border-neutral-100 pt-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">
          The app cannot check these for you
        </p>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <Printer className="text-neutral-400 shrink-0 mt-0.5" size={15} aria-hidden="true" />
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              <span className="font-bold text-neutral-700">Print a poster for every business.</span>{' '}
              Each one carries that shop&rsquo;s own code. Print them from the Businesses tab and
              deliver them before opening day.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <RotateCw className="text-neutral-400 shrink-0 mt-0.5" size={15} aria-hidden="true" />
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              <span className="font-bold text-neutral-700">Rotate every code the morning you open.</span>{' '}
              Codes get photographed and shared while shops test their posters. Rotating kills those
              copies, but you have to reprint afterwards, so do it before the posters go up for real.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <Mail className="text-neutral-400 shrink-0 mt-0.5" size={15} aria-hidden="true" />
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              <span className="font-bold text-neutral-700">Send invite links within 48 hours.</span>{' '}
              Every invite expires two days after you create it, so export the mail merge on the day
              you actually send the email, not a week early.
            </p>
          </li>
        </ul>
      </div>
    </div>
  );
};
