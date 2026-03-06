import type { Meta, StoryObj } from '@storybook/react-vite';
import { AIProxyComponent } from './AIProxyComponent.js';

const meta: Meta<typeof AIProxyComponent> = {
  title: 'AI/AIProxyComponent',
  component: AIProxyComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof AIProxyComponent>;

export const Default: Story = {
  args: {
    configurationId: 'demo-config',
  },
};

export const CustomPlaceholder: Story = {
  args: {
    configurationId: 'demo-config',
    placeholder: 'What would you like to know?',
  },
};
