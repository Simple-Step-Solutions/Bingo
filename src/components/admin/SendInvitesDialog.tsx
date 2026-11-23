import React, { useEffect, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { X, Send, Loader2, MailCheck, AlertTriangle } from 'lucide-react';
import { db } from '../../firebase';
import { sendInvites, errorMessage, InviteRecipient, InviteSkip, InviteResult } from '../../services/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
}

const LINK = '{link}';

/**
 * Email every business its sign-up link, inside the chamber's letter, with the
 * How-To PDF attached. Sent by the sendInvites callable through Amazon SES.
 *
 * The letter is saved to settings/inviteLetter before a test or a send, and
 * the server reads it from there, so what is on screen is what goes out.
 */
export const SendInvitesDialog: React.FC<Props> = ({ isOpen, onClose, currentUserId }) => {
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState('');
  const [letter, setLetter] = useState('');
  const [recipients, setRecipients] = useState<InviteRecipient[]>([]);
  const [skipped, setSkipped] = useState<InviteSkip[]>([]);
  const [busy, setBusy] = useState<null | 'save' | 'test' | 'send'>(null);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [results, setResults] = useState<InviteResult[] | null>(null);

  const load = async () => {
    setLoading(true);
    setNote(null);
    try {
      const res = await sendInvites({ mode: 'preview' });
      setSubject(res.subject ?? '');
      setLetter(res.letter ?? '');
      setRecipients(res.send ?? []);
      setSkipped(res.skipped ?? []);
    } catch (err) {
      setNote({ text: errorMessage(err, 'Could not load the invite list.'), error: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setResults(null);
      setConfirming(false);
      load();
    }
  }, [isOpen]);

  const problem = !subject.trim()
    ? 'Add a subject line.'
    : !letter.includes(LINK)
      ? `Put ${LINK} in the letter where each business's sign-up link goes.`
      : null;

  const save = async () => {
    await setDoc(doc(db, 'settings', 'inviteLetter'), {
      subject: subject.trim(),
      letter,
      updatedBy: currentUserId,
      updatedAt: serverTimestamp(),
    });
  };

  const run = async (mode: 'save' | 'test' | 'send') => {
    if (problem) { setNote({ text: problem, error: true }); return; }
    setBusy(mode);
    setNote(null);
    try {
      await save();
      if (mode === 'save') {
        setNote({ text: 'Letter saved.', error: false });
      } else if (mode === 'test') {
        const res = await sendInvites({ mode: 'test' });
        setNote({ text: `Test sent to ${res.to}. Check that inbox before sending to everyone.`, error: false });
      } else {
        const res = await sendInvites({ mode: 'send' });
        setResults(res.results ?? []);
        setConfirming(false);
        setNote({
          text: `${res.sent ?? 0} sent${res.failed ? `, ${res.failed} failed` : ''}.`,
          error: !!res.failed,
        });
        // Refresh the lists, so a second press only offers what is left.
        const fresh = await sendInvites({ mode: 'preview' });
        setRecipients(fresh.send ?? []);
        setSkipped(fresh.skipped ?? []);
      }
    } catch (err) {
      setNote({ text: errorMessage(err, 'That did not work. Please try again.'), error: true });
    } finally {
      setBusy(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={busy === 'send' ? undefined : onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
      />
      <div className="relative bg-white rounded-3xl p-6 md:p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <button
          onClick={onClose}
          disabled={busy === 'send'}
          className="absolute top-4 right-4 p-2 hover:bg-neutral-100 rounded-full transition-colors disabled:opacity-30"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <h3 className="font-serif italic text-2xl mb-1">Send Invites</h3>
        <p className="text-sm text-neutral-500 mb-6">
          Each business gets this letter with its own sign-up link where <code className="bg-neutral-100 px-1 rounded">{LINK}</code> sits,
          and the How-To PDF attached. <code className="bg-neutral-100 px-1 rounded">{'{business}'}</code> becomes the business name.
          Replies go to info@hvgatewaychamber.com, which is copied on every email.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-neutral-500 py-12 justify-center">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Loading...
          </div>
        ) : (
          <>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              className="w-full mb-4 px-4 py-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-neutral-900"
            />

            <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Letter</label>
            <textarea
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
              rows={14}
              maxLength={10000}
              className="w-full mb-4 px-4 py-3 border border-neutral-200 rounded-xl text-sm font-sans leading-relaxed focus:outline-none focus:border-neutral-900"
            />

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="bg-neutral-50 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">
                  Will be emailed ({recipients.length})
                </p>
                <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                  {recipients.map((r) => (
                    <li key={r.id}><span className="font-bold">{r.name}</span> <span className="text-neutral-500">{r.email}</span></li>
                  ))}
                  {recipients.length === 0 && <li className="text-neutral-400">Nobody left to email.</li>}
                </ul>
              </div>
              <div className="bg-neutral-50 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">
                  Skipped ({skipped.length})
                </p>
                <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                  {skipped.map((s) => (
                    <li key={s.id}><span className="font-bold">{s.name}</span> <span className="text-neutral-500">{s.reason}</span></li>
                  ))}
                  {skipped.length === 0 && <li className="text-neutral-400">None.</li>}
                </ul>
              </div>
            </div>

            {note && (
              <p role="status" className={`text-sm mb-4 flex items-start gap-2 ${note.error ? 'text-red-600' : 'text-emerald-700'}`}>
                {note.error ? <AlertTriangle size={16} className="shrink-0 mt-0.5" /> : <MailCheck size={16} className="shrink-0 mt-0.5" />}
                {note.text}
              </p>
            )}

            {results && results.some((r) => r.status !== 'sent') && (
              <ul className="text-xs mb-4 space-y-1 text-red-600">
                {results.filter((r) => r.status !== 'sent').map((r) => (
                  <li key={r.id}>{r.name} ({r.email}): {r.error || r.status}</li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-3 justify-end">
              <button
                onClick={() => run('save')}
                disabled={busy !== null}
                className="px-4 py-3 bg-white border border-neutral-200 rounded-2xl text-xs font-bold uppercase tracking-widest disabled:opacity-40 hover:border-neutral-900 transition-all"
              >
                {busy === 'save' ? 'Saving...' : 'Save Letter'}
              </button>
              <button
                onClick={() => run('test')}
                disabled={busy !== null}
                title="Emails this letter to you, with Sample Business as the name and a marked sample where the link goes. No real link, nothing sent to businesses."
                className="px-4 py-3 bg-white border border-neutral-200 rounded-2xl text-xs font-bold uppercase tracking-widest disabled:opacity-40 hover:border-neutral-900 transition-all"
              >
                {busy === 'test' ? 'Sending...' : 'Send Me a Test'}
              </button>
              {!confirming ? (
                <button
                  onClick={() => { setConfirming(true); setNote(null); }}
                  disabled={busy !== null || recipients.length === 0}
                  className="flex items-center gap-2 px-4 py-3 bg-[#CC5500] text-white rounded-2xl text-xs font-bold uppercase tracking-widest disabled:opacity-40 hover:opacity-90 transition-all"
                >
                  <Send size={14} aria-hidden="true" /> Send to {recipients.length} Businesses
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-neutral-700">Email {recipients.length} businesses now?</span>
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={busy !== null}
                    className="px-4 py-3 bg-white border border-neutral-200 rounded-2xl text-xs font-bold uppercase tracking-widest disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => run('send')}
                    disabled={busy !== null}
                    className="flex items-center gap-2 px-4 py-3 bg-[#CC5500] text-white rounded-2xl text-xs font-bold uppercase tracking-widest disabled:opacity-40"
                  >
                    {busy === 'send' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
                    {busy === 'send' ? 'Sending...' : 'Yes, Send'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
