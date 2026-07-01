import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@shared': '/Users/justinbernard/projects/languagebridge-rebuild/backend/shared',
    },
  },
});
