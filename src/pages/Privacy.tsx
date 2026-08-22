import { Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Mail, Eye, Trash2 } from 'lucide-react';
import { AppSettings } from '../types';

interface PrivacyProps {
  settings: AppSettings | null;
}

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({
  icon, title, children,
}) => (
  <section className="mb-10">
    <h2 className="flex items-center gap-3 font-bold text-lg mb-3">
      <span className="text-[var(--color-primary)]" aria-hidden="true">{icon}</span>
      {title}
    </h2>
    <div className="text-sm text-neutral-600 leading-relaxed space-y-3">{children}</div>
  </section>
);

/**
 * Privacy disclosure.
 *
 * The app collects a consumer's email and their continuous location, and shows
 * a live player map to chamber staff. None of that was disclosed anywhere. This
 * page says plainly what is collected, who sees it, and how to stop it.
 *
 * Written to be read by a person standing on a sidewalk, not by a lawyer.
 */
export const Privacy: React.FC<PrivacyProps> = ({ settings }) => {
  const chamber = settings?.chamberName || 'the Chamber';

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-neutral-900 transition-colors mb-8"
      >
        <ArrowLeft size={14} aria-hidden="true" /> Back to your board
      </Link>

      <h1 className="font-serif italic text-4xl md:text-5xl mb-3">Privacy</h1>
      <p className="text-neutral-500 text-sm leading-relaxed mb-10">
        What this app collects, who can see it, and how to stop it.
      </p>

      <Section icon={<Mail size={18} />} title="Your account">
        <p>
          Signing in gives us your email address and display name from Google, or
          the email you register with. Staff at {chamber} can see both, along
          with the town you pick and which businesses you have visited.
        </p>
        <p>
          Other players never see your email. If you appear on a leaderboard, it
          is by display name only, and only if you opt in.
        </p>
      </Section>

      <Section icon={<MapPin size={18} />} title="Your location">
        <p>
          Verifying a visit checks that you are within 500 metres of the business,
          so your device sends its coordinates when you scan a code. Those
          coordinates are stored with the visit, along with the distance we
          measured, so a disputed prize can be settled fairly.
        </p>
        <p>
          While the app is open on a phone it also records your approximate
          position about once a minute, and only when you have moved more than 30
          metres. Staff at {chamber} can see a live map of where players are.
        </p>
        <p className="font-semibold text-neutral-900">
          You can turn location off in your browser or phone settings at any time.
          Everything except verifying a visit keeps working without it.
        </p>
      </Section>

      <Section icon={<Eye size={18} />} title="Who sees what">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Staff at {chamber}</strong> see your name, email, town,
            visits, and current location while you are playing.
          </li>
          <li>
            <strong>A participating business</strong> sees the display names of
            players who verified a visit to that business, and nothing else. Not
            your email, and not your location.
          </li>
          <li>
            <strong>Other players</strong> see nothing about you unless you opt in
            to the leaderboard.
          </li>
        </ul>
        <p>
          We do not sell this information, and there is no advertising or
          third-party analytics in this app.
        </p>
      </Section>

      <Section icon={<Trash2 size={18} />} title="Deleting your data">
        <p>
          Ask {chamber} to delete your account and everything attached to it will
          be removed: your profile, your board, your visits, and your raffle
          entries. Contact details are on the Chamber website.
        </p>
        <p>
          Aggregate visit counts that no longer identify anyone may be kept, so
          the Chamber can tell member businesses how much foot traffic the game
          produced.
        </p>
      </Section>

      <p className="text-xs text-neutral-500 border-t border-neutral-200 pt-6">
        This app is run by {chamber}. Questions about your data should go to them
        directly.
      </p>
    </div>
  );
};
