import React, { useState, useEffect } from 'react';
import { collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { AppSettings, GameEvent, RaffleEntry, Win, Winner } from '../../types';
import {
  Trophy, Ticket, Users, Trash2, Sparkles, Loader2, Check, Gift, AlertTriangle,
} from 'lucide-react';
import { drawRaffleWinner, redeemWin, errorMessage, isExpectedError } from '../../services/api';
import { HelpTip } from './HelpTip';
import { ConfirmButton } from './ConfirmButton';

interface PrizeCenterProps {
  raffleEntries: RaffleEntry[];
  winners: Winner[];
  settings: AppSettings;
  activeEvent: GameEvent | null;
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '');

/**
 * Everything to do with handing a prize over, in one place.
 *
 * Three finished server features had no interface at all before this. Bingo
 * wins were recorded by verifyVisit and never shown, so the chamber could not
 * answer "who won and have we given them anything". redeemWin existed to close
 * that loop and was unreachable. And the raffle draw ran in the browser rather
 * than through drawRaffleWinner, which is the fair, audited one that also
 * refuses to pick the same person twice.
 */
export const PrizeCenter: React.FC<PrizeCenterProps> = ({ raffleEntries, winners, settings, activeEvent }) => {
  const [wins, setWins] = useState<Win[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justDrew, setJustDrew] = useState<{ userName: string; userEmail: string; poolSize: number } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'wins'),
      snap => setWins(snap.docs.map(d => ({ id: d.id, ...d.data() } as Win))),
      err => console.error('Wins snapshot error:', err),
    );
    return unsub;
  }, []);

  const rafflePrize = settings.rafflePrize?.trim();
  const bingoPrize = activeEvent?.bingoPrize || settings.bingoPrize;

  const seasonWins = wins
    .filter(w => (activeEvent ? (w.eventId || 'legacy') === activeEvent.id : true))
    .sort((a, b) => (b.timestampIso || '').localeCompare(a.timestampIso || ''));
  const unredeemed = seasonWins.filter(w => !w.redeemed).length;

  const draw = async () => {
    setDrawing(true);
    setError(null);
    setJustDrew(null);
    try {
      const res = await drawRaffleWinner({});
      setJustDrew({ userName: res.winner.userName || res.winner.userEmail, userEmail: res.winner.userEmail, poolSize: res.poolSize });
    } catch (err) {
      if (!isExpectedError(err)) console.error('drawRaffleWinner failed:', err);
      setError(errorMessage(err, 'Could not draw a winner.'));
    } finally {
      setDrawing(false);
    }
  };

  const markRedeemed = async (win: Win) => {
    setRedeeming(win.id);
    setError(null);
    try {
      await redeemWin({ winId: win.id });
    } catch (err) {
      if (!isExpectedError(err)) console.error('redeemWin failed:', err);
      setError(errorMessage(err, 'Could not mark that prize as collected.'));
    } finally {
      setRedeeming(null);
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <p className="text-red-600 text-xs font-bold">{error}</p>
        </div>
      )}

      {/* --- Bingo winners ------------------------------------------------- */}
      <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="bg-neutral-900 p-2 rounded-xl">
              <Trophy className="text-white" size={20} aria-hidden="true" />
            </div>
            <h3 className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-xs text-neutral-400">
              Bingo Winners
              <HelpTip label="bingo winners">
                <p>Everyone who has filled a line on their board this season. The app records these on its own, the moment the winning visit is verified.</p>
                <p>Mark someone as collected once you have actually handed the prize over. That is the only record of who has been paid out.</p>
              </HelpTip>
            </h3>
          </div>
          {unredeemed > 0 && (
            <span className="text-[10px] bg-orange-50 text-orange-700 px-3 py-1 rounded-full font-bold uppercase tracking-widest">
              {unredeemed} waiting to collect
            </span>
          )}
        </div>
        <p className="text-sm text-neutral-500 leading-relaxed mb-6">
          Recorded automatically when a player completes a line.
          {bingoPrize
            ? <> The current bingo prize is <span className="font-bold text-neutral-700">{bingoPrize}</span>.</>
            : <> No bingo prize is set yet. Add one on the Game tab so winners know what they get.</>}
        </p>

        {seasonWins.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-neutral-200 rounded-2xl">
            <Trophy className="mx-auto text-neutral-200 mb-3" size={40} aria-hidden="true" />
            <p className="text-sm text-neutral-500 font-medium">Nobody has finished a board yet.</p>
            <p className="text-xs text-neutral-400 mt-1">Winners appear here by themselves as soon as someone does.</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {seasonWins.map(win => (
              <div key={win.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    win.redeemed ? 'bg-green-50 text-green-600' : 'bg-yellow-100 text-yellow-600'
                  }`}>
                    {win.redeemed ? <Check size={18} aria-hidden="true" /> : <Trophy size={18} aria-hidden="true" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{win.userName || win.userEmail}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-1">
                      <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                        {when(win.timestampIso)}
                      </p>
                      <span className="text-[10px] bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600 font-bold uppercase tracking-widest">
                        {win.completionsCount ?? 0} visits
                      </span>
                      {win.redeemed && (
                        <span className="text-[10px] bg-green-50 px-2 py-0.5 rounded-full text-green-700 font-bold uppercase tracking-widest">
                          Collected
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {win.redeemed ? (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 shrink-0">
                    Handed over
                  </span>
                ) : (
                  <button
                    onClick={() => markRedeemed(win)}
                    disabled={redeeming === win.id}
                    className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 transition-all disabled:opacity-50"
                  >
                    {redeeming === win.id
                      ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                      : <Gift size={12} aria-hidden="true" />}
                    Mark collected
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- Raffle draw --------------------------------------------------- */}
      <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-50 p-2 rounded-xl">
              <Ticket className="text-yellow-600" size={20} aria-hidden="true" />
            </div>
            <h3 className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-xs text-neutral-400">
              Raffle Draw
              <HelpTip label="the raffle draw">
                <p>Players who reach the entry requirement can put their name in the raffle. Each name below is one entry.</p>
                <p>Drawing picks one name at random on the server and writes a permanent record of the pool size and who was picked, so the result can be shown to have been fair. Someone who has already won is never picked again.</p>
                <p>Draw once per prize. To pick three winners, press it three times.</p>
              </HelpTip>
            </h3>
          </div>
          <span className="text-[10px] bg-neutral-100 px-3 py-1 rounded-full font-bold text-neutral-600 uppercase tracking-widest">
            {raffleEntries.length} entr{raffleEntries.length === 1 ? 'y' : 'ies'}
          </span>
        </div>
        <p className="text-sm text-neutral-500 leading-relaxed mb-6">
          {rafflePrize
            ? <>Each draw awards <span className="font-bold text-neutral-700">{rafflePrize}</span> and records who won.</>
            : <>No raffle prize is set. Add one under Raffle Settings on the Game tab, otherwise the winner record will not say what they won.</>}
        </p>

        {!rafflePrize && raffleEntries.length > 0 && (
          <div className="mb-6 flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4">
            <AlertTriangle className="text-orange-600 shrink-0 mt-0.5" size={16} aria-hidden="true" />
            <p className="text-[11px] text-orange-800 leading-relaxed">
              You can still draw without a prize name, but the winner record will be
              blank where the prize should be. It is easier to set it first than to
              explain later.
            </p>
          </div>
        )}

        <button
          onClick={draw}
          disabled={drawing || raffleEntries.length === 0}
          className="flex items-center gap-2 bg-yellow-600 text-white px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-yellow-700 transition-all shadow-md disabled:opacity-40"
        >
          {drawing
            ? <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            : <Sparkles size={13} aria-hidden="true" />}
          {drawing ? 'Drawing...' : 'Draw one winner'}
        </button>

        {justDrew && (
          <div className="mt-6 p-6 bg-yellow-50 rounded-3xl border border-yellow-100 animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-2 mb-3 text-yellow-800">
              <Sparkles size={18} aria-hidden="true" />
              <h4 className="font-bold uppercase tracking-widest text-[10px]">Drawn and recorded</h4>
            </div>
            <p className="font-serif italic text-3xl text-neutral-900">{justDrew.userName}</p>
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold mt-1">{justDrew.userEmail}</p>
            <p className="text-[11px] text-neutral-500 leading-relaxed mt-3">
              Picked from {justDrew.poolSize} eligible {justDrew.poolSize === 1 ? 'entry' : 'entries'}.
              They are already saved to the winners list below and will not be picked again.
            </p>
          </div>
        )}

        <div className="mt-8 divide-y divide-neutral-100">
          {raffleEntries.length > 0 ? raffleEntries.map(entry => (
            <div key={entry.id} className="flex justify-between items-center py-4 first:pt-0 last:pb-0">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400 shrink-0">
                  <Users size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{entry.userName || entry.userEmail}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">{when(entry.timestamp)}</p>
                    <span className="text-[10px] bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600 font-bold uppercase tracking-widest">
                      {entry.completionsCount} Tasks
                    </span>
                  </div>
                </div>
              </div>
              <ConfirmButton
                title="Remove this entry?"
                body="They drop out of the raffle pool and will not be picked. Use this only if the entry was a mistake or the player has withdrawn."
                confirmLabel="Remove"
                ariaLabel={`Remove the raffle entry for ${entry.userName || entry.userEmail}`}
                onConfirm={() => deleteDoc(doc(db, 'raffle_entries', entry.id))}
                className="p-2 text-neutral-500 hover:text-red-500 transition-colors"
              >
                <Trash2 size={18} aria-hidden="true" />
              </ConfirmButton>
            </div>
          )) : (
            <div className="text-center py-12">
              <Ticket className="mx-auto text-neutral-100 mb-4" size={48} aria-hidden="true" />
              <p className="text-neutral-500 text-sm font-medium">No raffle entries yet.</p>
              <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto leading-relaxed">
                A player can enter once they have {settings.raffleRequirement || 5} verified
                visits{settings.raffleEnabled === false ? ', but the raffle is currently switched off on the Game tab' : ''}.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* --- Recorded raffle winners --------------------------------------- */}
      <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-yellow-100 p-2 rounded-xl">
            <Sparkles className="text-yellow-700" size={20} aria-hidden="true" />
          </div>
          <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Raffle Winners</h3>
        </div>
        <p className="text-sm text-neutral-500 leading-relaxed mb-6">
          Every name drawn, with the time it happened. This is the record to point at
          if a draw is ever questioned.
        </p>

        <div className="divide-y divide-neutral-100">
          {winners.length > 0 ? winners.map(winner => (
            <div key={winner.id} className="flex justify-between items-center py-4 first:pt-0 last:pb-0">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600 shrink-0">
                  <Trophy size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{winner.userName || winner.userEmail}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-1">
                    <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">{when(winner.timestamp)}</p>
                    {winner.prize && (
                      <span className="text-[10px] bg-yellow-50 px-2 py-0.5 rounded-full text-yellow-700 font-bold uppercase tracking-widest">
                        {winner.prize}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ConfirmButton
                title="Delete this winner record?"
                body="The audit trail of the draw stays, but this row disappears from the winners list. Only do this if the draw was run by mistake."
                ariaLabel={`Delete the winner record for ${winner.userName || winner.userEmail}`}
                onConfirm={() => deleteDoc(doc(db, 'winners', winner.id))}
                className="p-2 text-neutral-500 hover:text-red-500 transition-colors"
              >
                <Trash2 size={18} aria-hidden="true" />
              </ConfirmButton>
            </div>
          )) : (
            <div className="text-center py-12">
              <Trophy className="mx-auto text-neutral-100 mb-4" size={48} aria-hidden="true" />
              <p className="text-neutral-500 text-sm font-medium">No winners drawn yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
