import type { Meta, StoryObj } from '@storybook/react-vite';
import { TwoFactorSettingsComponent } from './TwoFactorSettingsComponent.js';

const meta: Meta<typeof TwoFactorSettingsComponent> = {
  title: 'Security/TwoFactorSettingsComponent',
  component: TwoFactorSettingsComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof TwoFactorSettingsComponent>;

export const Default: Story = {
  args: {},
};
