import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['apple-touch-icon-v2.png', 'favicon-v2.png', 'launch-1206x2622.png', 'tokens/*'],
            manifest: {
                id: '/',
                start_url: '/',
                scope: '/',
                name: 'Orbit Vault Simulator',
                short_name: 'Orbit Vault',
                description: 'A local crypto wallet interface simulator with read-only market quotes',
                theme_color: '#000000',
                background_color: '#ab9ff2',
                display: 'standalone',
                icons: [
                    { src: 'pwa-192-v2.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                    { src: 'pwa-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                    { src: 'app-icon.svg', sizes: 'any', type: 'image/svg+xml' },
                ],
            },
        }),
    ],
    test: { environment: 'jsdom' },
});
