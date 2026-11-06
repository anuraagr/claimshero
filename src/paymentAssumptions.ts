export const PAYMENT_ASSUMPTIONS = {
  label: 'Illustrative fixed-payment scenario',
  codingYear: 'FY2026',
  grouperVersion: '43.1',
  validFrom: '2026-04-01',
  validThrough: '2026-09-30',
  fusionRates: { '451': 31800, '448': 39800 },
  exclusions: 'Wage index, IME/DSH, transfers, outliers, quality adjustments, sequestration, new-technology payments and contract carve-outs are not calculated.',
  disclaimer: 'These are demo assumptions, not CMS prices or actual payer entitlements.',
} as const;

export const CHARGE_ASSUMPTIONS = {
  roomPerDay: 1250,
  operatingRoomPerMinute: 45,
  recoveryBundle: 1450,
  deviceChargeMultiplier: 1.65,
  missingMeshCharge: 3900,
} as const;
