import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoadingSpinner } from './LoadingSpinner.js';

const meta: Meta<typeof LoadingSpinner> = {
  title: 'Common/LoadingSpinner',
  component: LoadingSpinner,
  tags: ['autodocs'],
  argTypes: {
    size: { control: { type: 'range', min: 16, max: 100 } },
    color: { control: 'color' },
  },
};

export default meta;
type Story = StoryObj<typeof LoadingSpinner>;

export const Default: Story = {};

export const Small: Story = {
  args: { size: 20 },
};

export const Large: Story = {
  args: { size: 80 },
};

export const WithMessage: Story = {
  args: { message: 'Loading your data...' },
};

export const CustomColor: Story = {
  args: { color: '#3B82F6', message: 'Custom blue spinner' },
};
