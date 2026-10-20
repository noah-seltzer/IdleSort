import { useEffect, useState } from 'react';
import type { SessionView } from '../game/session';
import type { ReceiverView } from '../sim';

const NOTICE_MS = 2500;
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const rate = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 1 });

/** Heads-up display over the factory: Money, the Receiver's Run, income and hints. */
export function Hud({ view }: { view: SessionView }) {
  const { snapshot, incomePerSecond, notice } = view;
  const receiver = snapshot.nodes.find((n): n is ReceiverView => n.type === 'receiver');
  const runLength = receiver?.run.length ?? 0;

  return (
    <div className="hud">
      <div className="hud-stats">
        <Stat label="Money" value={money.format(snapshot.money)} testId="money" />
        <Stat label="Income" value={`${rate.format(incomePerSecond)}/s`} testId="income" />
        <Stat label="Run" value={String(runLength)} testId="run" />
        {runLength >= 2 && (
          <span key={runLength} className="hud-run-bonus" data-testid="run-bonus">
            ×{runLength} Run!
          </span>
        )}
      </div>
      {snapshot.connections.length === 0 && (
        <p className="hud-hint">Drag from the Producer’s output Port to the Receiver’s input Port to connect them.</p>
      )}
      <NoticeToast notice={notice} />
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="hud-stat">
      <span className="hud-stat-label">{label}</span>
      <span className="hud-stat-value" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

function NoticeToast({ notice }: { notice: SessionView['notice'] }) {
  const [visibleId, setVisibleId] = useState<number | null>(null);

  useEffect(() => {
    if (!notice) return;
    setVisibleId(notice.id);
    const timer = setTimeout(() => setVisibleId(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!notice || visibleId !== notice.id) return null;
  return (
    <p className="hud-notice" role="alert">
      {notice.message}
    </p>
  );
}
