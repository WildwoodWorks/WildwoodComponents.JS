import type { Meta, StoryObj } from '@storybook/react-vite';
import { TokenRegistrationComponent } from './TokenRegistrationComponent.js';

const meta: Meta<typeof TokenRegistrationComponent> = {
  title: 'Auth/TokenRegistrationComponent',
  component: TokenRegistrationComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof TokenRegistrationComponent>;

export const Default: Story = {
  args: {
    appId: 'demo-app',
  },
};

export const WithToken: Story = {
  args: {
    appId: 'demo-app',
    registrationToken: 'abc123-demo-token',
  },
};
