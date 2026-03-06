import type { Meta, StoryObj } from '@storybook/react-vite';
import { SubscriptionComponent } from './SubscriptionComponent.js';

const meta: Meta<typeof SubscriptionComponent> = {
  title: 'Subscription/SubscriptionComponent',
  component: SubscriptionComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SubscriptionComponent>;

export const Default: Story = {
  args: {
    autoLoad: true,
  },
};

export const ManualLoad: Story = {
  args: {
    autoLoad: false,
  },
};
