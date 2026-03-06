import type { Meta, StoryObj } from '@storybook/react-vite';
import { AIChatComponent } from './AIChatComponent.js';

const meta: Meta<typeof AIChatComponent> = {
  title: 'AI/AIChatComponent',
  component: AIChatComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof AIChatComponent>;

export const Default: Story = {
  args: {
    configurationName: 'default',
    showSessionList: true,
  },
};

export const NoSessionList: Story = {
  args: {
    configurationName: 'default',
    showSessionList: false,
  },
};

export const WithExistingSession: Story = {
  args: {
    configurationName: 'default',
    sessionId: 'demo-session-id',
    showSessionList: true,
  },
};
