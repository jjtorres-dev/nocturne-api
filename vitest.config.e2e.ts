import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Todos los e2e comparten una sola Postgres (dev local). Por defecto
    // Vitest corre archivos de test en paralelo, y varios de estos e2e
    // miden agregados globales (SalesService.summary, AccountingService)
    // por delta antes/después — si dos archivos corren al mismo tiempo, uno
    // puede contaminar la medición del otro entre su "antes" y su
    // "después". Server-side, ejecutarlos secuencialmente es más simple y
    // confiable que aislar cada test por fecha/servicio.
    fileParallelism: false,
  },
});
