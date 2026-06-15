import { forwardRef } from 'react';
import { Check, X } from 'lucide-react';

export interface ShareCardSelection {
  rank?: number | null;
  name: string;
  country?: string | null;
  multiplier: number;
  positionLabel?: string; // e.g. "1ST", "2ND", "3RD" for podium legs
}

export interface ShareCardProps {
  type: 'prediction' | 'settled';
  status: 'PREDICTION' | 'WIN' | 'LOSS' | 'LIVE';
  tournamentName: string;
  discipline?: string;
  dateLabel?: string;
  selections: ShareCardSelection[];
  combinedMultiplier?: number | null;
  tokenEntry: number;
  projectedReward: number;
  actualReward?: number | null;
  username: string;
}

const STATUS_LABEL: Record<ShareCardProps['status'], string> = {
  PREDICTION: 'MY PICKS',
  WIN: 'WIN',
  LOSS: 'RESULT',
  LIVE: 'LIVE',
};

const DISPLAY = "'Bebas Neue', 'Inter Tight', sans-serif";
const SANS = "'Inter Tight', system-ui, sans-serif";
const CYAN = '#00E5FF';

function chipLabel(s: ShareCardSelection): string {
  if (s.positionLabel) return s.positionLabel;
  if (s.rank) return `#${s.rank}`;
  return 'PICK';
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(props, ref) {
  const {
    type, status, tournamentName, discipline, dateLabel,
    selections, combinedMultiplier, tokenEntry, projectedReward, actualReward, username,
  } = props;

  const isParlay = selections.length > 1;
  const isSettled = type === 'settled';
  const isWin = isSettled && status === 'WIN';
  const isLoss = isSettled && status === 'LOSS';
  const rewardValue = isSettled ? (isWin ? actualReward ?? 0 : 0) : projectedReward;
  const rewardLabel = isSettled ? 'ACTUAL RESULT' : 'PROJECTED REWARD';
  const accent = isLoss ? '#7A7A7A' : CYAN;

  return (
    <div ref={ref} style={{ width: 1080, height: 1920, position: 'relative', background: '#000', overflow: 'hidden' }}>
      {/* background layers */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#02141a 0%,#001920 26%,#000 68%)' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,229,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.05) 1px,transparent 1px)', backgroundSize: '64px 64px' }} />
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 20%, rgba(0,229,255,${isLoss ? 0.12 : 0.26}), rgba(0,229,255,0.06) 32%, transparent 62%)` }} />

      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '96px 80px 88px', boxSizing: 'border-box' }}>
        {/* TOP */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <div style={{ width: 74, height: 74, border: `3px solid ${CYAN}`, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 26px rgba(0,229,255,0.45)', background: 'rgba(0,229,255,0.06)' }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 46, color: CYAN, lineHeight: 1 }}>W</span>
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, letterSpacing: '0.24em', color: '#fff' }}>WATERSKI&nbsp;PREDICTOR</div>
          </div>
          <div style={{ padding: '16px 30px', borderRadius: 999, background: `rgba(0,229,255,${isLoss ? 0.06 : 0.12})`, border: `1.5px solid ${isLoss ? 'rgba(255,255,255,0.25)' : 'rgba(0,229,255,0.6)'}`, color: accent, fontFamily: SANS, fontWeight: 800, fontSize: 26, letterSpacing: '0.16em' }}>
            {STATUS_LABEL[status]}
          </div>
        </div>
        <div style={{ height: 1.5, background: 'rgba(0,229,255,0.4)', marginTop: 44 }} />

        {/* HERO */}
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, letterSpacing: '0.3em', color: CYAN, marginTop: 54, textTransform: 'uppercase' }}>
          {'★'}&nbsp;{discipline || 'PREDICTION'}
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 150, lineHeight: 0.9, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.005em', marginTop: 18 }}>
          {tournamentName}
        </div>
        {dateLabel && (
          <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 28, letterSpacing: '0.14em', color: '#8A8A8A', marginTop: 24, textTransform: 'uppercase' }}>{dateLabel}</div>
        )}

        {/* SELECTIONS */}
        <div style={{ marginTop: 60, display: 'flex', flexDirection: 'column' }}>
          {selections.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 28, padding: '28px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ minWidth: 104, height: 64, borderRadius: 12, background: 'rgba(0,229,255,0.08)', border: '1.5px solid rgba(0,229,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontWeight: 800, fontSize: 26, color: CYAN, letterSpacing: '0.06em', padding: '0 14px' }}>
                {chipLabel(s)}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 16 }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 64, color: '#fff', textTransform: 'uppercase', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                {s.country && <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 28, color: '#8A8A8A', letterSpacing: '0.08em' }}>{s.country}</span>}
              </div>
              <div style={{ fontFamily: DISPLAY, fontSize: 74, color: accent }}>{s.multiplier.toFixed(2)}{'×'}</div>
            </div>
          ))}
          {isParlay && combinedMultiplier != null && (
            <div style={{ alignSelf: 'flex-end', marginTop: 32, padding: '16px 32px', borderRadius: 14, background: 'rgba(0,229,255,0.10)', border: '1.5px solid rgba(0,229,255,0.45)', color: CYAN, fontFamily: DISPLAY, fontSize: 52, letterSpacing: '0.02em' }}>
              COMBO {combinedMultiplier.toFixed(2)}{'×'}
            </div>
          )}
        </div>

        {/* REWARD */}
        <div style={{ marginTop: 'auto', borderLeft: `10px solid ${accent}`, background: `linear-gradient(90deg, rgba(0,229,255,${isLoss ? 0.06 : 0.16}), rgba(0,229,255,0.02))`, boxShadow: 'inset 0 0 60px rgba(0,229,255,0.08)', padding: '40px 46px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, letterSpacing: '0.22em', color: '#AAA' }}>{rewardLabel}</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 120, lineHeight: 0.85, color: accent, marginTop: 10 }}>
              {rewardValue.toLocaleString()}<span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 30, letterSpacing: '0.16em', color: accent, marginLeft: 12 }}>TOKENS</span>
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 24, letterSpacing: '0.1em', color: '#6B6B6B', marginTop: 14 }}>{tokenEntry.toLocaleString()} TOKEN ENTRY</div>
          </div>
          {isSettled ? (
            <div style={{ width: 104, height: 104, borderRadius: '50%', background: isWin ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.06)', border: `2px solid ${isWin ? CYAN : '#2A2A2A'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isWin ? <Check size={60} color={CYAN} strokeWidth={3} /> : <X size={60} color="#7A7A7A" strokeWidth={3} />}
            </div>
          ) : (
            <div style={{ fontFamily: DISPLAY, fontSize: 120, color: accent }}>{'→'}</div>
          )}
        </div>

        {/* SHARE NUDGE */}
        <div style={{ marginTop: 28, border: '1.5px solid rgba(0,229,255,0.45)', borderRadius: 10, padding: '24px', textAlign: 'center' }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, letterSpacing: '0.12em', color: CYAN }}>THINK YOU CAN CALL IT? PLAY FREE {'·'} WATERSKIPREDICTOR.COM</span>
        </div>

        {/* FOOTER */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 36, paddingTop: 30 }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontSize: 58, color: '#fff', letterSpacing: '0.01em' }}>@{username}</div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 22, letterSpacing: '0.2em', color: '#888', marginTop: 8, textTransform: 'uppercase' }}>Where every pass matters</div>
          </div>
          <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 24, letterSpacing: '0.12em', color: '#888' }}>waterskipredictor.com</div>
        </div>
      </div>
    </div>
  );
});
