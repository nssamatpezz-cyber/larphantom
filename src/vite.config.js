import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['apple-touch-icon.png', 'tokens/*'],
            manifest: {
                id: '/',
                start_url: '/',
                scope: '/',
                name: 'Orbit Vault Simulator',
                short_name: 'Orbit Vault',
                description: 'A local crypto wallet interface simulator with read-only market quotes',
                theme_color: '#000000',
                background_color: '#000000',
                display: 'standalone',
                icons: [
                    { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                    { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                    { src: 'pwa-192.svg', sizes: '192x192', type: 'image/svg+xml' },
                    { src: 'pwa-512.svg', sizes: '512x512', type: 'image/svg+xml' },
                ],
            },
        }),
    ],
    test: { environment: 'jsdom' },
});
