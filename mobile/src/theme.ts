export type ThemeMode = 'light' | 'dark';

export interface AppColors {
  mode: ThemeMode;
  bg: string;
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;        // Logo Emerald Green
  primarySoft: string;
  primaryText: string;
  crimson: string;        // Logo Crimson Red
  crimsonSoft: string;
  gold: string;           // Cash Memo Bronze/Gold
  goldSoft: string;
  amber: string;
  amberSoft: string;
  headerBg: string;
  tabBg: string;
  shadow: string;
}

export const LIGHT_COLORS: AppColors = {
  mode: 'light',
  bg: '#F8FAF9',          // Crisp soft white
  card: '#FFFFFF',
  cardAlt: '#F1F6F3',
  border: '#E2E8E4',
  text: '#111827',
  textMuted: '#6B7280',
  primary: '#0E8A44',     // Logo Emerald Green
  primarySoft: '#E6F5EC',
  primaryText: '#FFFFFF',
  crimson: '#C62828',     // Logo Crimson Red
  crimsonSoft: '#FEECEC',
  gold: '#8C5E2A',        // Cash Memo Bronze/Gold
  goldSoft: '#FBF4EA',
  amber: '#D97706',
  amberSoft: '#FEF3C7',
  headerBg: '#FFFFFF',
  tabBg: '#FFFFFF',
  shadow: '#0E8A44',
};

export const DARK_COLORS: AppColors = {
  mode: 'dark',
  bg: '#000000',          // 100% Pure AMOLED Black
  card: '#0B0B0E',        // Deep Pure Dark surface
  cardAlt: '#141418',
  border: '#232329',
  text: '#FFFFFF',
  textMuted: '#A1A1AA',
  primary: '#22C55E',
  primarySoft: '#092414',
  primaryText: '#000000',
  crimson: '#F87171',
  crimsonSoft: '#2A0D10',
  gold: '#F5B95F',
  goldSoft: '#241909',
  amber: '#FBBF24',
  amberSoft: '#261C07',
  headerBg: '#000000',
  tabBg: '#09090B',
  shadow: '#000000',
};
