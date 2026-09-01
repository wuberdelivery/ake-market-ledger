// ============================================================
// AKE LEDGER — Design tokens
// Tuned for: cheap Android screens, bright market sunlight,
// low-literacy users. High contrast, huge targets, color = meaning.
// ============================================================

export const colors = {
  // The three doors — these ARE the interface language
  moneyIn: '#1B7F3B',      // deep market green
  moneyInPressed: '#145E2C',
  moneyOut: '#C62828',     // strong red
  moneyOutPressed: '#8E1F1F',
  ledger: '#F5A800',       // àkọsílẹ̀ yellow (amber, readable in sun)
  ledgerPressed: '#C68700',

  bg: '#FFFDF7',           // warm off-white, less glare than pure white
  surface: '#FFFFFF',
  ink: '#1A1A1A',          // near-black text
  inkSoft: '#5C5C5C',

  profit: '#1B7F3B',
  loss: '#C62828',
  debtTag: '#C62828',
  paidTag: '#1B7F3B',
  warning: '#E65100',      // low stock

  border: '#E4DFD2',
  disabled: '#BDBDBD',
  white: '#FFFFFF',
};

export const spacing = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
};

// Minimum touch target: 64. Primary buttons: much bigger.
export const touch = {
  min: 64,
  bigButton: 120,   // home screen door height
  padKey: 72,       // number pad key
  gridTile: 104,    // product photo tile
};

export const type = {
  // Money numbers are the hero — set them enormous
  money: { fontSize: 44, fontWeight: '800' as const },
  moneyBig: { fontSize: 56, fontWeight: '800' as const },
  h1: { fontSize: 28, fontWeight: '700' as const },
  h2: { fontSize: 22, fontWeight: '700' as const },
  body: { fontSize: 18, fontWeight: '400' as const },
  label: { fontSize: 16, fontWeight: '600' as const },
  small: { fontSize: 14, fontWeight: '400' as const },
};

export const radius = { sm: 10, md: 16, lg: 24 };
