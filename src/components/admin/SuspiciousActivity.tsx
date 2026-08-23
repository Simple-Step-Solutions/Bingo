import React, { useState } from 'react';
import { Business, UserProfile } from '../../types';
import { ShieldAlert, Loader2, Search, CheckCircle2 } from 'lucide-react';
import { reviewSuspiciousActivity, SuspicionFlag, errorMessage, isExpectedError } from '../../services/api';
import { HelpTip } from './HelpTip';

interface SuspiciousActivityProps {
  users: UserProfile[];
  businesses: Business[];
}

/**
 * The cheating review panel.
 *
 * The server has computed these signals since the code split shipped and
 * nothing ever displayed them, so the documented posture -- unguessable codes
 * plus a human adjudicating before prizes are handed over -- had no second
 * half. Be straight with the reader about what a flag is worth: none of these
 * prove anything on their own, and a chamber volunteer should not be told
 * otherwise.
 *
 * Run on demand rather than on tab open. It walks every completion in the
 * database, which is not something to do each time somebody clicks Activity.
 */
export const SuspiciousActivity: React.FC<SuspiciousActivityProps> = ({ users, businesses }) => {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    flags: SuspicionFlag[]; completionsReviewed: number; playersReviewed: number;
  } | null>(null);

  const nameFor = (uid?: string) => {
    if (!uid) return 'Unknown player';
    const u = users.find(x => x.uid === uid);
    return u?.displayName || u?.email || uid.slice(0, 8);
  };
  const bizName = (id?: string) => businesses.find(b => b.id === id)?.name || 'a business';

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setResult(await reviewSuspiciousActivity({}));
    } catch (err) {
      if (!isExpectedError(err)) console.error('reviewSuspiciousActivity failed:', err);
      setError(errorMessage(err, 'Could not run the review.'));
    } finally {
      setRunning(false);
    }
  };

  const describe = (flag: SuspicionFlag): { headline: string; meaning: string; tone: string } => {
    switch (flag.type) {
      case 'impossible_travel':
        return {
          headline: `${nameFor(flag.userId)} moved between ${bizName(flag.from)} and ${bizName(flag.to)} at about ${flag.kmh} km/h`,
          meaning: 'That is faster than driving. Either their phone reported the wrong location, or someone checked in for them from somewhere else. The strongest signal on this list, but a bad GPS fix in a basement can cause it too.',
          tone: 'border-red-200 bg-red-50',
        };
      case 'burst':
        return {
          headline: `${nameFor(flag.userId)} checked in 5 times within ${flag.windowMinutes} minutes`,
          meaning: 'Possible in a dense main street where the shops are next door to each other. Worth a look if the businesses are far apart.',
          tone: 'border-orange-200 bg-orange-50',
        };
      case 'no_app_check':
        return {
          headline: `All ${flag.count} of ${nameFor(flag.userId)}'s check-ins came from an unverified app`,
          meaning: 'Their visits did not carry the token a genuine copy of the app attaches. Usually an old browser or a privacy extension, occasionally a script pretending to be the app.',
          tone: 'border-yellow-200 bg-yellow-50',
        };
      case 'near_geofence_boundary':
        return {
          headline: `${nameFor(flag.userId)} checked in ${flag.count} times right at the edge of the allowed radius`,
          meaning: 'Consistently 450 metres or more from the shop. Someone standing in the car park across the road looks like this, and so does someone who never went in.',
          tone: 'border-yellow-200 bg-yellow-50',
        };
      case 'shared_ip':
        return {
          headline: `${flag.userCount} accounts checked in from the same internet connection`,
          meaning: 'A family on one home connection looks exactly like one person running several accounts. Cross-check the names before treating it as anything.',
          tone: 'border-yellow-200 bg-yellow-50',
        };
      default:
        return { headline: 'Unrecognised signal', meaning: '', tone: 'border-neutral-200 bg-neutral-50' };
    }
  };

  return (
    <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-neutral-100 p-2 rounded-xl">
          <ShieldAlert className="text-neutral-900" size={20} aria-hidden="true" />
        </div>
        <h3 className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-xs text-neutral-400">
          Check for cheating
          <HelpTip label="the cheating check">
            <p>Scans every recorded visit for patterns that are hard to produce by walking around town: impossible travel speeds, bursts of check-ins, and accounts sharing one internet connection.</p>
            <p>Nothing here is proof. It is a shortlist for a person to look at before a prize is handed over.</p>
          </HelpTip>
        </h3>
      </div>
      <p className="text-sm text-neutral-500 leading-relaxed mb-6">
        Worth running once before you hand out the main prizes. No phone app can
        prove somebody physically walked into a shop, so this shows you what looks
        unusual and leaves the judgement to you.
      </p>

      {error && (
        <div role="alert" className="mb-6 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <p className="text-red-600 text-xs font-bold">{error}</p>
        </div>
      )}

      <button
        onClick={run}
        disabled={running}
        className="flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 transition-all disabled:opacity-50"
      >
        {running
          ? <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          : <Search size={13} aria-hidden="true" />}
        {running ? 'Checking every visit...' : 'Run the check'}
      </button>

      {result && (
        <div className="mt-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">
            {result.completionsReviewed} visits by {result.playersReviewed} players reviewed
          </p>

          {result.flags.length === 0 ? (
            <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
              <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={18} aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-green-800">Nothing stood out.</p>
                <p className="text-[11px] text-green-700 leading-relaxed mt-1">
                  No impossible travel, no bursts and no shared connections. Hand the
                  prizes out with a clear conscience.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {result.flags.map((flag, i) => {
                const { headline, meaning, tone } = describe(flag);
                return (
                  <div key={`${flag.type}-${i}`} className={`rounded-2xl border p-5 ${tone}`}>
                    <p className="text-sm font-bold text-neutral-900 leading-snug">{headline}</p>
                    <p className="text-[11px] text-neutral-600 leading-relaxed mt-2">{meaning}</p>
                  </div>
                );
              })}
              <p className="text-[11px] text-neutral-500 leading-relaxed pt-2">
                To look into one of these, find the player on the People tab. You can
                view their board, see every visit they recorded, and reset their
                progress if you decide something is wrong.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
