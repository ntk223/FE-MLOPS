import { build } from 'vite';
import { resolve } from 'path';

async function main() {
  await build({
    build: {
      ssr: true,
      lib: {
        entry: resolve(process.cwd(), 'tests/test-chat.ts'),
        formats: ['es'],
        fileName: 'test-chat-bundle',
      },
      emptyOutDir: false,
      outDir: resolve(process.cwd(), 'tests/dist'),
    },
  });

  // Dynamically import the bundled test
  await import('./dist/test-chat.js');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
