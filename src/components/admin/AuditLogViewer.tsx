import React from 'react';
import { AuditLog } from '../../types';
import { Clock } from 'lucide-react';

interface AuditLogViewerProps {
  logs: AuditLog[];
}

const actionBadge = (action: string) => {
  if (action === 'add_completion') return 'bg-green-100 text-green-700';
  if (action === 'remove_completion') return 'bg-red-100 text-red-700';
  if (action.startsWith('reset_') || action === 'reset') return 'bg-orange-100 text-orange-700';
  if (action === 'change_role') return 'bg-blue-100 text-blue-700';
  return 'bg-neutral-100 text-neutral-600';
};

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ logs }) => {
  const sorted = [...logs]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 200);

  return (
    <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-neutral-100 p-2 rounded-xl">
          <Clock className="text-neutral-900" size={20} />
        </div>
        <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Audit Log</h3>
        <span className="ml-auto text-[10px] text-neutral-400 font-bold uppercase tracking-widest">
          {sorted.length} entries
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16">
          <Clock className="mx-auto text-neutral-200 mb-4" size={48} />
          <p className="text-neutral-400 text-sm italic">No audit entries yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-100">
          {sorted.map(log => (
            <div key={log.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-neutral-400 shrink-0">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0 ${actionBadge(log.action)}`}>
                  {log.action}
                </span>
                <span className="text-xs font-bold text-neutral-700 truncate">{log.actorEmail}</span>
                {log.targetEmail && (
                  <span className="text-xs text-neutral-400 truncate">{log.targetEmail}</span>
                )}
              </div>
              {log.details && Object.keys(log.details).length > 0 && (
                <details className="mt-1">
                  <summary className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest cursor-pointer hover:text-neutral-700 transition-colors select-none">
                    Details
                  </summary>
                  <pre className="mt-1 text-[9px] text-neutral-500 bg-neutral-50 border border-neutral-100 rounded-xl px-3 py-2 overflow-x-auto font-mono">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
