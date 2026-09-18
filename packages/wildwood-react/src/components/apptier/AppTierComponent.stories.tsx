import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppTierComponent } from './AppTierComponent.js';

const meta: Meta<typeof AppTierComponent> = {
  title: 'Features/AppTierComponent',
  component: AppTierComponent,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          '**Deprecated** — use `RegistrationAndSubscriptionComponent` with `view="manage"`.',
          '',
          "This component's payment step passes no `pricingModelId`, so a paid plan is charged once",
          'instead of starting the plan subscription and its trial. It is kept exported and unchanged',
          'for the hosts already on it.',
        ].join('\n'),
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof AppTierComponent>;

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
