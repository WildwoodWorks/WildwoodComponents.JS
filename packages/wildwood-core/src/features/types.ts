// Disclaimer and App Tier types - ported from WildwoodComponents.Shared/Models/

// Disclaimer types
export { type PendingDisclaimerModel } from '../auth/types.js';

export interface DisclaimerAcceptanceResult {
  companyDisclaimerId: string;
  companyDisclaimerVersionId: string;
}

export interface PendingDisclaimersResponse {
  hasPendingDisclaimers: boolean;
  disclaimers: import('../auth/types.js').PendingDisclaimerModel[];
  errorMessage?: string;
}

export interface DisclaimerAcceptanceResponse {
  success: boolean;
  errorMessage?: string;
}

// App Tier types
export interface AppTierModel {
  id: string;
  appId: string;
  name: string;
  description: string;
  displayOrder: number;
  isDefault: boolean;
  isFreeTier: boolean;
  allowUpgrades: boolean;
  allowDowngrades: boolean;
  status: string;
  badgeColor: string;
  iconClass: string;
  pricingOptions: AppTierPricingModel[];
  features: AppTierFeatureModel[];
  limits: AppTierLimitModel[];
}

export interface AppTierPricingModel {
  id: string;
  appTierId: string;
  pricingModelId: string;
  isDefault: boolean;
  displayOrder: number;
  pricingModelName: string;
  price: number;
  billingFrequency: string;
}

export interface AppTierFeatureModel {
  id: string;
  featureCode: string;
  displayName: string;
  description: string;
  isEnabled: boolean;
  category: string;
}

export interface AppTierLimitModel {
  id: string;
  limitCode: string;
  displayName: string;
  maxValue: number;
  limitType: string;
  unit: string;
}

export interface AppTierAddOnModel {
  id: string;
  appId: string;
  name: string;
  description: string;
  category: string;
  status: string;
  displayOrder: number;
  iconClass: string;
  badgeColor: string;
  trialDays?: number;
  features: AppTierAddOnFeatureModel[];
  pricingOptions: AppTierAddOnPricingModel[];
  bundledInTierIds: string[];
}

export interface AppTierAddOnFeatureModel {
  id: string;
  featureCode: string;
  displayName: string;
  description: string;
}

export interface AppTierAddOnPricingModel {
  id: string;
  pricingModelId: string;
  pricingModelName: string;
  price: number;
  billingFrequency: string;
  isDefault: boolean;
}

export interface UserTierSubscriptionModel {
  id: string;
  userId: string;
  appId: string;
  appTierId: string;
  status: string;
  startDate: string;
  endDate?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  trialEndDate?: string;
  tierName: string;
  tierDescription: string;
  isFreeTier: boolean;
  pendingTierName: string;
  pendingChangeDate?: string;
}

export interface UserAddOnSubscriptionModel {
  id: string;
  appTierAddOnId: string;
  status: string;
  addOnName: string;
  addOnDescription: string;
  isBundled: boolean;
  startDate: string;
  endDate?: string;
}

export interface AppFeatureCheckResultModel {
  featureCode: string;
  displayName: string;
  hasAccess: boolean;
  currentTierName: string;
  requiredTierName: string;
  upgradeMessage: string;
  availableAsAddOn: boolean;
  addOnId: string;
  addOnName: string;
  addOnPrice?: number;
}

export interface AppTierLimitStatusModel {
  limitCode: string;
  displayName: string;
  currentUsage: number;
  maxValue: number;
  isUnlimited: boolean;
  usagePercent: number;
  isAtWarningThreshold: boolean;
  isExceeded: boolean;
  isHardBlocked: boolean;
  unit: string;
  statusMessage: string;
}

export interface AppFeatureDefinitionModel {
  featureCode: string;
  displayName: string;
  description: string;
  category: string;
  iconClass: string;
  displayOrder: number;
  isEnabled: boolean;
}

export interface AppTierChangeResultModel {
  success: boolean;
  errorMessage: string;
  subscription?: UserTierSubscriptionModel;
  isScheduled: boolean;
  effectiveDate?: string;
}
