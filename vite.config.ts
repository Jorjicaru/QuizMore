import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const isPreviewOrDisabledHmr =
    process.env.DISABLE_HMR === 'true' ||
    process.env.AI_STUDIO_PREVIEW === 'true' ||
    Boolean(process.env.K_SERVICE || process.env.CLOUD_RUN_JOB);

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR or Cloud Run preview env vars.
      hmr: !isPreviewOrDisabledHmr,
      // Disable file watching when HMR is disabled to save CPU during agent edits.
      watch: isPreviewOrDisabledHmr ? null : {},
    },
  };
});
