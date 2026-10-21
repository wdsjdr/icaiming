import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import { petLocalIntegration } from './scripts/pet/local.ts';

export default defineConfig({
  integrations: [tailwind(), petLocalIntegration()],
  output: 'static',
});
