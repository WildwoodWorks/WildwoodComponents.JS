import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ErrorBoundary } from './ErrorBoundary.js';

function ThrowingComponent(): React.ReactNode {
  throw new Error('Test error for Storybook');
}

function SafeChild() {
  return <div style={{ padding: 16 }}>Content renders normally when no error occurs.</div>;
}

const meta: Meta<typeof ErrorBoundary> = {
  title: 'Common/ErrorBoundary',
  component: ErrorBoundary,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ErrorBoundary>;

export const NoError: Story = {
  args: {
    children: <SafeChild />,
  },
};

export const WithError: Story = {
  args: {
    children: <ThrowingComponent />,
  },
};

export const CustomFallback: Story = {
  args: {
    children: <ThrowingComponent />,
    fallback: (error, reset) => (
      <div style={{ padding: 16, border: '2px solid red', borderRadius: 8 }}>
        <h4>Custom Error UI</h4>
        <p>{error.message}</p>
        <button onClick={reset}>Reset</button>
      </div>
    ),
  },
};
