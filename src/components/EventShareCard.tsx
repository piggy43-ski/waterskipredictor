import { forwardRef } from 'react';

export interface EventShareRow {
  chip: string;          // WIN / POD / HIGH / PARLAY
  text: string;          // athlete(s) + discipline tag
  mult?: number | null;  // decimal odds / combo
}

export interface EventShareCardProps {
  tournamentName: string;
  dateLabel?: string;
  username: string;
  pickCount: number;
  entryCount: number;
  parlayCount: number;
  totalEntryTokens: number;
  totalProjectedReward: number;
  settled?: boolean;     // if all settled, label shifts to "TOTAL RESULT"
  rows: EventShareRow[];
  moreCount?: number;
}

const DISPLAY = "'Bebas Neue', 'Inter Tight', sans-serif";
const SANS = "'Inter Tight', system-ui, sans-serif";
const CYAN = '#00E5FF';

export const EventShareCard = forwardRef<HTMLDivElement, EventShareCardProps>(function EventShareCard(props, ref) {
  const {
    tournamentName, dateLabel, username, pickCount, entryCount, parlayCount,
    totalEntryTokens, totalProjectedReward, settled, rows, moreCount = 0,
  } = props;

  return (
    <div ref={ref} style={{ width: 1080, height: 1920, position: 'relative', background: '#000', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#02141a 0%,#001920 26%,#000 68%)' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,229,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.05) 1px,transparent 1px)', backgroundSize: '64px 64px' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 18%, rgba(0,229,255,0.26), rgba(0,229,255,0.06) 32%, transparent 62%)' }} />

      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '88px 80px 80px', boxSizing: 'border-box' }}>
        {/* TOP */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <div style={{ width: 74, height: 74, border: `3px solid ${CYAN}`, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 26px rgba(0,229,255,0.45)', background: 'rgba(0,229,255,0.06)' }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 46, color: CYAN, lineHeight: 1 }}>W</span>
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, letterSpacing: '0.24em', color: '#fff' }}>WATERSKI&nbsp;PREDICTOR</div>
          </div>
          <div style={{ padding: '16px 30px', borderRadius: 999, background: 'rgba(0,229,255,0.12)', border: `1.5px solid rgba(0,229,255,0.6)`, color: CYAN, fontFamily: SANS, fontWeight: 800, fontSize: 26, letterSpacing: '0.16em' }}>MY CARD</div>
        </div>
        <div style={{ height: 1.5, background: 'rgba(0,229,255,0.4)', marginTop: 40 }} />

        {/* HERO */}
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, letterSpacing: '0.3em', color: CYAN, marginTop: 46, textTransform: 'uppercase' }}>{'★'}&nbsp;MY PICKS</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 132, lineHeight: 0.9, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.005em', marginTop: 16 }}>{tournamentName}</div>

        {/* stat strip */}
        <div style={{ display: 'flex', gap: 0, marginTop: 30, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}>
          {[
            { n: pickCount, l: 'PICKS' },
            { n: entryCount, l: 'ENTRIES' },
            { n: parlayCount, l: 'PARLAYS' },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, padding: '24px 0', textAlign: 'center', borderLeft: i ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 74, color: CYAN, lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 22, letterSpacing: '0.2em', color: '#8A8A8A', marginTop: 8 }}>{s.l}</div>
            </div>
          ))}
        </div>
        {dateLabel && <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 24, letterSpacing: '0.14em', color: '#8A8A8A', marginTop: 22, textTransform: 'uppercase' }}>{dateLabel}</div>}

        {/* ROWS */}
        <div style={{ flex: 1, marginTop: 28, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ minWidth: 116, height: 48, borderRadius: 9, background: 'rgba(0,229,255,0.08)', border: '1.5px solid rgba(0,229,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontWeight: 800, fontSize: 22, color: CYAN, letterSpacing: '0.06em', padding: '0 12px' }}>{r.chip}</div>
              <div style={{ flex: 1, minWidth: 0, fontFamily: DISPLAY, fontSize: 44, color: '#fff', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.01em' }}>{r.text}</div>
              {r.mult != null && <div style={{ fontFamily: DISPLAY, fontSize: 52, color: CYAN }}>{r.mult.toFixed(2)}{'×'}</div>}
            </div>
          ))}
          {moreCount > 0 && (
            <div style={{ padding: '18px 0', fontFamily: SANS, fontWeight: 700, fontSize: 28, letterSpacing: '0.12em', color: '#8A8A8A' }}>+{moreCount} MORE {moreCount === 1 ? 'PICK' : 'PICKS'}</div>
          )}
        </div>

        {/* REWARD */}
        <div style={{ borderLeft: `10px solid ${CYAN}`, background: 'linear-gradient(90deg, rgba(0,229,255,0.16), rgba(0,229,255,0.02))', boxShadow: 'inset 0 0 60px rgba(0,229,255,0.08)', padding: '34px 44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 24, letterSpacing: '0.22em', color: '#AAA' }}>{settled ? 'TOTAL RESULT' : 'PROJECTED REWARD'}</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 108, lineHeight: 0.85, color: CYAN, marginTop: 8 }}>
              {totalProjectedReward.toLocaleString()}<span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 28, letterSpacing: '0.16em', color: CYAN, marginLeft: 12 }}>TOKENS</span>
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 24, letterSpacing: '0.1em', color: '#6B6B6B', marginTop: 12 }}>{totalEntryTokens.toLocaleString()} TOKENS ENTERED</div>
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 108, color: CYAN }}>{'→'}</div>
        </div>

        {/* NUDGE */}
        <div style={{ marginTop: 24, border: '1.5px solid rgba(0,229,255,0.45)', borderRadius: 10, padding: '22px', textAlign: 'center' }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, letterSpacing: '0.12em', color: CYAN }}>THINK YOU CAN BEAT MY CARD? PLAY FREE {'·'} WATERSKIPREDICTOR.COM</span>
        </div>

        {/* FOOTER */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 30, paddingTop: 26 }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontSize: 56, color: '#fff', letterSpacing: '0.01em' }}>@{username}</div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 22, letterSpacing: '0.2em', color: '#888', marginTop: 6, textTransform: 'uppercase' }}>Where every pass matters</div>
          </div>
          <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 24, letterSpacing: '0.12em', color: '#888' }}>waterskipredictor.com</div>
        </div>
      </div>
    </div>
  );
});
