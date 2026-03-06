import type { Meta, StoryObj } from '@storybook/react-vite';
import { PaymentComponent } from './PaymentComponent.js';

const meta: Meta<typeof PaymentComponent> = {
  title: 'Payment/PaymentComponent',
  component: PaymentComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof PaymentComponent>;

export const Default: Story = {
  args: {},
};

export const WithCustomer: Story = {
  args: {
    customerId: 'cus_demo123',
  },
};
