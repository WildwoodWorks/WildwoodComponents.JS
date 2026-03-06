import React from 'react';
import type { Preview, Decorator } from '@storybook/react-vite';
import { WildwoodProvider } from '../src/provider/WildwoodProvider.js';
import '../src/styles/wildwood-themes.css';

const withWildwoodProvider: Decorator = (Story) => (
  <WildwoodProvider config={{
    baseUrl: 'https://localhost:5291',
    appId: 'storybook-demo',
    storage: 'memory',
  }}>
    <Story />
  </WildwoodProvider>
);

const preview: Preview = {
  decorators: [withWildwoodProvider],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
