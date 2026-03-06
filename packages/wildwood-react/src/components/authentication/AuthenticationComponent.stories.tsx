import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuthenticationComponent } from './AuthenticationComponent.js';

const meta: Meta<typeof AuthenticationComponent> = {
  title: 'Components/Authentication',
  component: AuthenticationComponent,
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    showPasswordField: { control: 'boolean' },
    showDetailedErrors: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof AuthenticationComponent>;

export const Default: Story = {
  args: {
    title: 'Sign In',
    showPasswordField: true,
  },
};

export const LoginOnly: Story = {
  args: {
    title: 'Login',
    showPasswordField: true,
  },
};

export const WithDetailedErrors: Story = {
  args: {
    title: 'Sign In',
    showPasswordField: true,
    showDetailedErrors: true,
  },
};
