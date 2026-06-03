/**
 * Convert a country code (IOC 3-letter, ISO 3166-1 alpha-2, or common full
 * name) to a flag emoji. Unmapped codes fall back to a neutral white flag
 * (🏳️) rather than the black flag (🏴) which renders as a featureless box
 * in many fonts.
 */

// IOC 3-letter → ISO 3166-1 alpha-2.
// Extend as needed; unmapped codes fall through to the safe fallback.
const IOC_TO_ISO2: Record<string, string> = {
  USA: 'US', CAN: 'CA', GBR: 'GB', ITA: 'IT', MEX: 'MX', CHI: 'CL',
  ARG: 'AR', AUT: 'AT', SWE: 'SE', UKR: 'UA', DEN: 'DK', AUS: 'AU',
  MAR: 'MA', FRA: 'FR', ESP: 'ES', GER: 'DE', BRA: 'BR', JPN: 'JP',
  CHN: 'CN', RUS: 'RU', NZL: 'NZ', SUI: 'CH', NED: 'NL', POR: 'PT',
  POL: 'PL', BEL: 'BE', NOR: 'NO', FIN: 'FI', IRL: 'IE', RSA: 'ZA',
  COL: 'CO', VEN: 'VE', PER: 'PE', URU: 'UY', PAR: 'PY', CZE: 'CZ',
  SVK: 'SK', HUN: 'HU', GRE: 'GR', TUR: 'TR', ISR: 'IL', KOR: 'KR',
  PHI: 'PH', INA: 'ID', THA: 'TH', MAS: 'MY', SGP: 'SG', IND: 'IN',
  UAE: 'AE', KSA: 'SA', EGY: 'EG', TUN: 'TN', ALG: 'DZ', PUR: 'PR',
};

// Common full-name aliases → ISO 3166-1 alpha-2.
const NAME_TO_ISO2: Record<string, string> = {
  'united states': 'US', 'usa': 'US', 'america': 'US',
  'canada': 'CA', 'great britain': 'GB', 'united kingdom': 'GB', 'uk': 'GB',
  'italy': 'IT', 'mexico': 'MX', 'chile': 'CL', 'argentina': 'AR',
  'austria': 'AT', 'sweden': 'SE', 'ukraine': 'UA', 'denmark': 'DK',
  'australia': 'AU', 'morocco': 'MA', 'france': 'FR', 'spain': 'ES',
  'germany': 'DE', 'brazil': 'BR', 'japan': 'JP', 'china': 'CN',
  'russia': 'RU', 'new zealand': 'NZ', 'switzerland': 'CH',
  'netherlands': 'NL', 'portugal': 'PT', 'poland': 'PL', 'belgium': 'BE',
  'norway': 'NO', 'finland': 'FI', 'ireland': 'IE', 'south africa': 'ZA',
};

/** Neutral white flag fallback — visible across fonts, no political signal. */
const FALLBACK_FLAG = '🏳️';

/** Convert an ISO 3166-1 alpha-2 code to its flag emoji via regional indicators. */
const iso2ToFlag = (iso2: string): string => {
  if (!/^[A-Z]{2}$/.test(iso2)) return FALLBACK_FLAG;
  const A = 0x1f1e6;
  const codepoints = [iso2.charCodeAt(0) - 65 + A, iso2.charCodeAt(1) - 65 + A];
  return String.fromCodePoint(...codepoints);
};

/**
 * Resolve a country identifier to a flag emoji.
 * Accepts: ISO2 ('US'), IOC3 ('USA'), or common full names ('United States').
 */
export const getFlagEmoji = (input?: string | null): string => {
  if (!input) return FALLBACK_FLAG;
  const trimmed = input.trim();
  if (!trimmed) return FALLBACK_FLAG;

  const upper = trimmed.toUpperCase();
  if (upper.length === 2) return iso2ToFlag(upper);
  if (upper.length === 3 && IOC_TO_ISO2[upper]) return iso2ToFlag(IOC_TO_ISO2[upper]);

  const named = NAME_TO_ISO2[trimmed.toLowerCase()];
  if (named) return iso2ToFlag(named);

  return FALLBACK_FLAG;
};
