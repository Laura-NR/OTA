import preset from '@ota/ui/tailwind-preset';
import type { Config } from 'tailwindcss';

export default {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
} satisfies Config;
