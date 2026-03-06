import type { Meta, StoryObj } from '@storybook/react-vite';
import { SecureMessagingComponent } from './SecureMessagingComponent.js';

const meta: Meta<typeof SecureMessagingComponent> = {
  title: 'Messaging/SecureMessagingComponent',
  component: SecureMessagingComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SecureMessagingComponent>;

export const Default: Story = {
  args: {},
};
