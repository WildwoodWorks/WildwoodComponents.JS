export interface WildwoodTheme {
  colors: {
    primary: string;
    primaryLight: string;
    background: string;
    backgroundSecondary: string;
    text: string;
    textMuted: string;
    border: string;
    success: string;
    error: string;
    warning: string;
    info: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
  };
  fontSize: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
}

export const defaultTheme: WildwoodTheme = {
  colors: {
    primary: '#2d5016',
    primaryLight: '#4a7c2e',
    background: '#ffffff',
    backgroundSecondary: '#f5f5f5',
    text: '#1a1a1a',
    textMuted: '#666666',
    border: '#e0e0e0',
    success: '#2e7d32',
    error: '#c62828',
    warning: '#f57f17',
    info: '#1565c0',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 4,
    md: 6,
    lg: 12,
  },
  fontSize: {
    sm: 12,
    md: 14,
    lg: 16,
    xl: 20,
  },
};

export const themes: Record<string, Partial<WildwoodTheme>> = {
  'woodland-warm': {},
  'midnight-dark': {
    colors: {
      primary: '#6b9fff',
      primaryLight: '#8bb4ff',
      background: '#1a1a2e',
      backgroundSecondary: '#16213e',
      text: '#e0e0e0',
      textMuted: '#a0a0a0',
      border: '#2a2a4a',
      success: '#66bb6a',
      error: '#ef5350',
      warning: '#ffa726',
      info: '#42a5f5',
    },
  },
};
