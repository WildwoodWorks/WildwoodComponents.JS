import type { Meta, StoryObj } from '@storybook/react-vite';
import { NotificationToastComponent } from './NotificationToastComponent.js';
import { useNotifications } from '../../hooks/useNotifications.js';

const meta: Meta<typeof NotificationToastComponent> = {
  title: 'Components/NotificationToast',
  component: NotificationToastComponent,
  tags: ['autodocs'],
  argTypes: {
    position: {
      control: 'select',
      options: ['top-right', 'top-left', 'bottom-right', 'bottom-left', 'top-center', 'bottom-center'],
    },
    maxToasts: { control: { type: 'number', min: 1, max: 10 } },
  },
};

export default meta;
type Story = StoryObj<typeof NotificationToastComponent>;

function DemoButtons() {
  const { success, error, warning, info } = useNotifications();
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      <button onClick={() => success('Operation completed!')}>Success</button>
      <button onClick={() => error('Something went wrong')}>Error</button>
      <button onClick={() => warning('Please check your input')}>Warning</button>
      <button onClick={() => info('New updates available')}>Info</button>
    </div>
  );
}

export const Default: Story = {
  render: (args) => (
    <>
      <DemoButtons />
      <NotificationToastComponent {...args} />
    </>
  ),
};

export const BottomLeft: Story = {
  args: { position: 'bottom-left' },
  render: (args) => (
    <>
      <DemoButtons />
      <NotificationToastComponent {...args} />
    </>
  ),
};

export const TopCenter: Story = {
  args: { position: 'top-center' },
  render: (args) => (
    <>
      <DemoButtons />
      <NotificationToastComponent {...args} />
    </>
  ),
};
