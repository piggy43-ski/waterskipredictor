import { forwardRef } from 'react';

export interface EventShareRow {
  chip: string;
  text: string;
  mult?: number | null;
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
  settled?: boolean;
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

  // Adaptive density: shrink rows when there are a lot so they all fit on one card.
  const n = rows.length;
  const dense = n > 10;
  const mid = n > 6;
  const rPad = dense ? 8 : mid ? 11 : 14;
  const nmF = dense ? 34 : mid ? 38 : 42;
  const chH = dense ? 38 : 42;
  const chF = dense ? 19 : 21;
  const mF = dense ? 40 : mid ? 44 : 50;
  const heroF = tournamentName.length > 16 ? 88 : 104;

  return (
    <div ref={ref} style={{ width: 1080, height: 1920, position: 'relative', background: '#000', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#02141a 0%,#001920 26%,#000 68%)' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,229,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.05) 1px,transparent 1px)', backgroundSize: '64px 64px' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 18%, rgba(0,229,255,0.26), rgba(0,229,255,0.06) 32%, transparent 62%)' }} />

      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '80px 76px 72px', boxSizing: 'border-box' }}>
        {/* TOP */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 68, height: 68, border: `3px solid ${CYAN}`, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 24px rgba(0,229,255,0.45)', background: 'rgba(0,229,255,0.06)' }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 42, color: CYAN, lineHeight: 1 }}>W</span>
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 24, letterSpacing: '0.22em', color: '#fff' }}>WATERSKI&nbsp;PREDICTOR</div>
          </div>
          <div style={{ padding: '14px 28px', borderRadius: 999, background: 'rgba(0,229,255,0.12)', border: `1.5px solid rgba(0,229,255,0.6)`, color: CYAN, fontFamily: SANS, fontWeight: 800, fontSize: 24, letterSpacing: '0.14em' }}>MY CARD</div>
        </div>
        <div style={{ height: 1.5, background: 'rgba(0,229,255,0.4)', marginTop: 34 }} />

        {/* HERO */}
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 24, letterSpacing: '0.3em', color: CYAN, marginTop: 38, textTransform: 'uppercase' }}>{'★'}&nbsp;MY PICKS</div>
        <div style={{ fontFamily: DISPLAY, fontSize: heroF, lineHeight: 0.9, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.005em', marginTop: 12 }}>{tournamentName}</div>

        {/* stat strip */}
        <div style={{ display: 'flex', marginTop: 24, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}>
          {[
            { v: pickCount, l: 'PICKS' },
            { v: entryCount, l: 'ENTRIES' },
            { v: parlayCount, l: 'PARLAYS' },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, padding: '18px 0', textAlign: 'center', borderLeft: i ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 62, color: CYAN, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 19, letterSpacing: '0.2em', color: '#8A8A8A', marginTop: 6 }}>{s.l}</div>
            </div>
          ))}
        </div>
        {dateLabel && <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 22, letterSpacing: '0.14em', color: '#8A8A8A', marginTop: 16, textTransform: 'uppercase' }}>{dateLabel}</div>}

        {/* ROWS */}
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: `${rPad}px 0`, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ minWidth: 98, height: chH, borderRadius: 8, background: 'rgba(0,229,255,0.08)', border: '1.5px solid rgba(0,229,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontWeight: 800, fontSize: chF, color: CYAN, letterSpacing: '0.05em', padding: '0 12px' }}>{r.chip}</div>
              <div style={{ flex: 1, minWidth: 0, fontFamily: DISPLAY, fontSize: nmF, color: '#fff', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.01em' }}>{r.text}</div>
              {r.mult != null && <div style={{ fontFamily: DISPLAY, fontSize: mF, color: CYAN }}>{r.mult.toFixed(2)}{'×'}</div>}
            </div>
          ))}
          {moreCount > 0 && (
            <div style={{ padding: `${rPad}px 0`, fontFamily: SANS, fontWeight: 700, fontSize: 24, letterSpacing: '0.12em', color: '#8A8A8A' }}>+{moreCount} MORE {moreCount === 1 ? 'PICK' : 'PICKS'}</div>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 20 }} />

        {/* REWARD */}
        <div style={{ borderLeft: `10px solid ${CYAN}`, background: 'linear-gradient(90deg, rgba(0,229,255,0.16), rgba(0,229,255,0.02))', boxShadow: 'inset 0 0 60px rgba(0,229,255,0.08)', padding: '28px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 22, letterSpacing: '0.22em', color: '#AAA' }}>{settled ? 'TOTAL RESULT' : 'PROJECTED REWARD'}</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 96, lineHeight: 0.85, color: CYAN, marginTop: 6 }}>
              {totalProjectedReward.toLocaleString()}<span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 26, letterSpacing: '0.16em', color: CYAN, marginLeft: 10 }}>TOKENS</span>
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 22, letterSpacing: '0.1em', color: '#6B6B6B', marginTop: 10 }}>{totalEntryTokens.toLocaleString()} TOKENS ENTERED</div>
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 96, color: CYAN }}>{'→'}</div>
        </div>

        {/* NUDGE */}
        <div style={{ marginTop: 20, border: '1.5px solid rgba(0,229,255,0.45)', borderRadius: 10, padding: '20px', textAlign: 'center' }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 24, letterSpacing: '0.1em', color: CYAN }}>THINK YOU CAN BEAT MY CARD? PLAY FREE {'·'} WATERSKIPREDICTOR.COM</span>
        </div>

        {/* FOOTER */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 24, paddingTop: 24 }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontSize: 52, color: '#fff', letterSpacing: '0.01em' }}>@{username}</div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 21, letterSpacing: '0.2em', color: '#888', marginTop: 6, textTransform: 'uppercase' }}>Where every pass matters</div>
          </div>
          <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 22, letterSpacing: '0.12em', color: '#888' }}>waterskipredictor.com</div>
        </div>
      </div>
    </div>
  );
});
