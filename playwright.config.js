// @ts-check
import { defineConfig, devices } from '@playwright/test';

// O executável do Chromium já vem pré-instalado no ambiente de execução
// (ver PLAYWRIGHT_BROWSERS_PATH); em CI, "npx playwright install chromium"
// baixa a mesma versão pinada em package.json antes de rodar isso.
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  // O boot do jogo gera a cidade proceduralmente (25 quarteirões, prédios
  // aleatórios) e roda em WebGL via software rendering (swiftshader) — um
  // único boot já leva vários segundos. Testes que recarregam a página
  // (save/load) fazem dois boots inteiros na mesma execução.
  //
  // O tamanho do orçamento vem de medição, não de chute: a mesma suíte levou
  // 6.3 min numa execução no CI e 13.2 min na seguinte, sem mudança
  // relevante no código — a variação de desempenho do runner é de ~2x. Um
  // teste que passa com folga no dia bom precisa passar no dia ruim também.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Cada teste sobe o jogo inteiro (cidade procedural + WebGL via software
  // rendering) — rodar vários workers em paralelo satura CPU e derruba o
  // boot de outros testes por timeout. Confiabilidade > velocidade aqui:
  // 1 worker por vez, tanto local quanto em CI.
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--use-gl=swiftshader'],
      ...(chromiumPath ? { executablePath: chromiumPath } : {}),
    },
  },
  webServer: {
    command: 'npx http-server -c-1 -p 8080 .',
    url: 'http://localhost:8080/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
  ],
});
