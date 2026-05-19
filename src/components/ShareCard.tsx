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
  PREDICTION: 'MY PREDICTION',
  WIN: 'WIN',
  LOSS: 'LOSS',
  LIVE: 'LIVE',
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// Tries to render a country flag emoji from a 2-letter ISO code, otherwise returns empty.
function flag(country?: string | null) {
  if (!country) return '';
  const code = country.trim().toUpperCase();
  if (code.length !== 2) return '';
  const A = 0x1f1e6;
  const base = 'A'.charCodeAt(0);
  return String.fromCodePoint(A + code.charCodeAt(0) - base, A + code.charCodeAt(1) - base);
}

/**
 * Vertical 1080x1920 shareable result card. Render in an offscreen container at
 * its native size; html-to-image will rasterize the ref'd node.
 */
export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  props,
  ref,
) {
  const {
    type,
    status,
    tournamentName,
    discipline,
    dateLabel,
    selections,
    combinedMultiplier,
    tokenEntry,
    projectedReward,
    actualReward,
    username,
  } = props;

  const isParlay = selections.length > 1;
  const isSettled = type === 'settled';
  const isWin = isSettled && status === 'WIN';
  const isLoss = isSettled && status === 'LOSS';

  const rewardValue = isSettled ? (isWin ? actualReward ?? 0 : 0) : projectedReward;
  const rewardLabel = isSettled ? 'ACTUAL RESULT' : 'PROJECTED REWARD';

  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        height: 1920,
        background: '#000000',
        color: '#FAFAFA',
        fontFamily: "'Inter Tight', system-ui, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        padding: '72px 80px',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* subtle cyan glow */}
      <div
        style={{
          position: 'absolute',
          top: -260,
          right: -260,
          width: 720,
          height: 720,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,229,255,0.18) 0%, rgba(0,229,255,0) 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* TOP ZONE */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, letterSpacing: 2 }}>
          WSP<span style={{ color: '#00E5FF' }}>.</span>
        </div>
        <div
          style={{
            padding: '12px 22px',
            borderRadius: 999,
            background: 'rgba(0,229,255,0.12)',
            border: '1px solid rgba(0,229,255,0.55)',
            color: '#00E5FF',
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: 3,
            textTransform: 'uppercase',
            fontFamily: "'Inter Tight', sans-serif",
          }}
        >
          {STATUS_LABEL[status]}
        </div>
      </div>
      <div style={{ height: 1, background: '#1F1F1F', marginTop: 40 }} />

      {/* MIDDLE ZONE */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          paddingTop: 36,
          paddingBottom: 36,
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 96,
            lineHeight: 0.95,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: '#FFFFFF',
          }}
        >
          {tournamentName}
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 22,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: '#8A8A8A',
            fontWeight: 600,
          }}
        >
          {[discipline, dateLabel].filter(Boolean).join('  •  ')}
        </div>

        {/* selections */}
        <div style={{ marginTop: 64, display: 'flex', flexDirection: 'column' }}>
          {selections.map((s, i) => (
            <div key={i}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '22px 0',
                  gap: 24,
                }}
              >
                <div
                  style={{
                    minWidth: 64,
                    height: 36,
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid #1F1F1F',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 22,
                    color: '#FAFAFA',
                    padding: '0 12px',
                  }}
                >
                  {s.positionLabel ?? (s.rank ? `#${s.rank}` : '—')}
                </div>
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg,#141414,#0A0A0A)',
                    border: '1px solid #1F1F1F',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 30,
                    color: '#FAFAFA',
                  }}
                >
                  {initials(s.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 38,
                      fontWeight: 800,
                      letterSpacing: -0.5,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {s.name} {flag(s.country) && <span style={{ marginLeft: 8 }}>{flag(s.country)}</span>}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 56,
                    color: '#00E5FF',
                    letterSpacing: 1,
                  }}
                >
                  {s.multiplier.toFixed(2)}×
                </div>
              </div>
              {i < selections.length - 1 && <div style={{ height: 1, background: '#141414' }} />}
            </div>
          ))}

          {isParlay && combinedMultiplier != null && (
            <div
              style={{
                marginTop: 28,
                alignSelf: 'flex-end',
                padding: '14px 26px',
                borderRadius: 10,
                background: 'rgba(0,229,255,0.10)',
                border: '1px solid rgba(0,229,255,0.45)',
                color: '#00E5FF',
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 40,
                letterSpacing: 1,
              }}
            >
              COMBO {combinedMultiplier.toFixed(2)}×
            </div>
          )}
        </div>

        {/* entry + reward */}
        <div style={{ marginTop: 80, textAlign: 'center' }}>
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 40,
              letterSpacing: 4,
              color: '#6B6B6B',
            }}
          >
            {tokenEntry.toLocaleString()} TOKENS
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: 18,
              letterSpacing: 5,
              color: '#5A5A5A',
              fontWeight: 700,
            }}
          >
            {rewardLabel}
          </div>
          <div
            style={{
              marginTop: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 24,
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 140,
              lineHeight: 1,
              letterSpacing: 1,
              color: isLoss ? '#7A7A7A' : '#00E5FF',
            }}
          >
            {isSettled &&
              (isWin ? (
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: '50%',
                    background: 'rgba(0,229,255,0.15)',
                    border: '2px solid #00E5FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={56} color="#00E5FF" strokeWidth={3} />
                </div>
              ) : (
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.06)',
                    border: '2px solid #2A2A2A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={56} color="#7A7A7A" strokeWidth={3} />
                </div>
              ))}
            {!isSettled && <span style={{ fontSize: 120 }}>→</span>}
            <span>{rewardValue.toLocaleString()}</span>
            <span style={{ fontSize: 60, color: isLoss ? '#7A7A7A' : '#00E5FF' }}>TOKENS</span>
          </div>
        </div>
      </div>

      {/* BOTTOM ZONE */}
      <div style={{ height: 1, background: '#1F1F1F', marginBottom: 32 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 56,
              letterSpacing: 2,
              color: '#FFFFFF',
            }}
          >
            @{username}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 18,
              letterSpacing: 5,
              color: '#6B6B6B',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            Where every pass matters
          </div>
        </div>
        <div
          style={{
            fontSize: 18,
            letterSpacing: 4,
            color: '#6B6B6B',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          waterskipredictor.com
        </div>
      </div>
    </div>
  );
});
