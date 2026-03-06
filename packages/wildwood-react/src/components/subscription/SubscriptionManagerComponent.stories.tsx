import type { Meta, StoryObj } from '@storybook/react-vite';
import { SubscriptionManagerComponent } from './SubscriptionManagerComponent.js';

const meta: Meta<typeof SubscriptionManagerComponent> = {
  title: 'Subscription/SubscriptionManagerComponent',
  component: SubscriptionManagerComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SubscriptionManagerComponent>;

export const Default: Story = {
  args: {
    autoLoad: true,
    showPlanSelector: true,
  },
};

export const NoPlanSelector: Story = {
  args: {
    autoLoad: true,
    showPlanSelector: false,
  },
};
