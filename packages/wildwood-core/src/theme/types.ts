// Theme types - ported from WildwoodComponents.Blazor/Models/ComponentModels.cs

export interface ComponentTheme {
  primaryColor: string;
  secondaryColor: string;
  successColor: string;
  warningColor: string;
  dangerColor: string;
  infoColor: string;
  lightColor: string;
  darkColor: string;
  fontFamily: string;
  borderRadius: string;
  boxShadow: string;
}

export type ThemeName = 'woodland-warm' | 'cool-blue' | 'fall-colors' | string;
