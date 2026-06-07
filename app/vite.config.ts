import { defineConfig } from 'vite';

// Прод-сборка живёт под /office (https://group.beauty-app.tech/office), поэтому
// build → base '/office/', а dev-сервер (localhost:5600) остаётся на '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/office/' : '/',
  server: { port: 5600, host: true },
  build: { target: 'es2020' },
}));
