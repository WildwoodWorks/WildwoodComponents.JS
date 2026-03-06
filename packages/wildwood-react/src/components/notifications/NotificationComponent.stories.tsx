import type { Meta, StoryObj } from '@storybook/react-vite';
import { NotificationComponent } from './NotificationComponent.js';

const meta: Meta<typeof NotificationComponent> = {
  title: 'Notifications/NotificationComponent',
  component: NotificationComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof NotificationComponent>;

export const Default: Story = {
  args: {},
};
