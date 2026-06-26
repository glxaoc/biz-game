import { defineConfig } from 'vite';

// Прод-сборка живёт под /office (https://group.beauty-app.tech/office), поэтому
// build → base '/office/', а dev-сервер (localhost:5600) остаётся на '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/office/' : '/',
  server: { port: 5600, host: true },
  build: {
    target: 'es2020',
    // две страницы: офис (index) и кабинет агента-компаньона (agent)
    rollupOptions: { input: { main: 'index.html', agent: 'agent.html', 'agent-stepanych': 'agent-stepanych.html' } },
  },
}));
