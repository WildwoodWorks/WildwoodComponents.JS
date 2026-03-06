# @wildwood/react-native

React Native components and hooks over @wildwood/core. Same hook pattern as @wildwood/react but with native UI primitives.

## Key Differences from @wildwood/react

- Default storage: 'memory' (consumers pass AsyncStorage adapter for persistence)
- No CSS - uses StyleSheet-based theme system (`src/styles/theme.ts`)
- Components use React Native primitives (View, Text, TextInput, Pressable)
- No HTML elements

## Conventions

- peerDeps: react 18/19, react-native >=0.72, @wildwood/core
- Hooks are functionally identical to @wildwood/react hooks
