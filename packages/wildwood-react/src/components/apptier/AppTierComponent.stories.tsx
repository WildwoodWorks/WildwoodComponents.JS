import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppTierComponent } from './AppTierComponent.js';

const meta: Meta<typeof AppTierComponent> = {
  title: 'Features/AppTierComponent',
  component: AppTierComponent,
  tags: ['autodocs'],
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
