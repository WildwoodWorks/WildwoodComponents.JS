import type { Meta, StoryObj } from '@storybook/react-vite';
import { PaymentFormComponent } from './PaymentFormComponent.js';

const meta: Meta<typeof PaymentFormComponent> = {
  title: 'Payment/PaymentFormComponent',
  component: PaymentFormComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof PaymentFormComponent>;

export const Default: Story = {
  args: {
    providerId: 'stripe',
    appId: 'demo-app',
    amount: 29.99,
    currency: 'USD',
    description: 'Premium subscription',
  },
};

export const LargeAmount: Story = {
  args: {
    providerId: 'stripe',
    appId: 'demo-app',
    amount: 199.99,
    currency: 'USD',
    description: 'Enterprise plan - annual',
  },
};
