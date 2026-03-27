import { Routes, Route } from 'react-router-dom';
import { WildwoodProvider } from '@wildwood/react';
import { MainLayout } from './components/layout/MainLayout';
import { Home } from './pages/Home';
import { AuthenticationTest } from './pages/AuthenticationTest';
import { NotificationTest } from './pages/NotificationTest';
import { ThemeTest } from './pages/ThemeTest';
import { TwoFactorTest } from './pages/TwoFactorTest';
import { TokenRegistrationTest } from './pages/TokenRegistrationTest';
import { DisclaimerTest } from './pages/DisclaimerTest';
import { AppTierTest } from './pages/AppTierTest';
import { AIChatTest } from './pages/AIChatTest';
import { AIFlowTest } from './pages/AIFlowTest';
import { MessagingTest } from './pages/MessagingTest';
import { PaymentTest } from './pages/PaymentTest';
import { SubscriptionTest } from './pages/SubscriptionTest';
import { PricingDisplayTest } from './pages/PricingDisplayTest';
import { SubscriptionAdminTest } from './pages/SubscriptionAdminTest';
import { NotificationToastTest } from './pages/NotificationToastTest';
import { PaymentFormTest } from './pages/PaymentFormTest';
import { SignupWithSubscriptionTest } from './pages/SignupWithSubscriptionTest';
import { SubscriptionManagerTest } from './pages/SubscriptionManagerTest';
import { UsageDashboardTest } from './pages/UsageDashboardTest';

const config = {
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  appId: import.meta.env.VITE_APP_ID || '',
  enableAutoTokenRefresh: true,
  sessionExpirationMinutes: 60,
};

export function App() {
  return (
    <WildwoodProvider config={config}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="authentication" element={<AuthenticationTest />} />
          <Route path="notifications" element={<NotificationTest />} />
          <Route path="theme" element={<ThemeTest />} />
          <Route path="twofactor" element={<TwoFactorTest />} />
          <Route path="token-registration" element={<TokenRegistrationTest />} />
          <Route path="disclaimer" element={<DisclaimerTest />} />
          <Route path="app-tier" element={<AppTierTest />} />
          <Route path="ai-chat" element={<AIChatTest />} />
          <Route path="ai-flow" element={<AIFlowTest />} />
          <Route path="messaging" element={<MessagingTest />} />
          <Route path="payment" element={<PaymentTest />} />
          <Route path="subscription" element={<SubscriptionTest />} />
          <Route path="pricing-display" element={<PricingDisplayTest />} />
          <Route path="subscription-admin" element={<SubscriptionAdminTest />} />
          <Route path="notification-toast" element={<NotificationToastTest />} />
          <Route path="payment-form" element={<PaymentFormTest />} />
          <Route path="signup-with-subscription" element={<SignupWithSubscriptionTest />} />
          <Route path="subscription-manager" element={<SubscriptionManagerTest />} />
          <Route path="usage-dashboard" element={<UsageDashboardTest />} />
        </Route>
      </Routes>
    </WildwoodProvider>
  );
}
