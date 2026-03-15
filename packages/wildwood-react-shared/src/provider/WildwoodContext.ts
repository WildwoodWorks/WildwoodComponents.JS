import { createContext } from 'react';
import type { WildwoodClient } from '@wildwood/core';

export const WildwoodContext = createContext<WildwoodClient | null>(null);
