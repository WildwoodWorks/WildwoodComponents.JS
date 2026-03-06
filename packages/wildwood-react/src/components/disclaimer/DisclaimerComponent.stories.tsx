import type { Meta, StoryObj } from '@storybook/react-vite';
import { DisclaimerComponent } from './DisclaimerComponent.js';

const meta: Meta<typeof DisclaimerComponent> = {
  title: 'Features/DisclaimerComponent',
  component: DisclaimerComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DisclaimerComponent>;

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
