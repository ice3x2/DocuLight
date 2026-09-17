import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XG3pAAAAAElFTkSuQmCC', 'base64');
const download = Buffer.from([0, 1, 2, 3, 254, 255]);
const svg = (width, height) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="rgba(20,100,180,.5)"/></svg>`);

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'issue58-native-file-routes',
      configureServer(server) {
        server.middlewares.use('/d', (request, response, next) => {
          if (request.url === '/download') {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/pdf');
            response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('긴 이름 📎 보고서 LongUnbrokenFilenameForDownload.pdf')}`);
            response.end(download);
            return;
          }
          if (request.url === '/wide' || request.url === '/tall') {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'image/svg+xml');
            response.end(request.url === '/wide' ? svg(2400, 240) : svg(240, 2400));
            return;
          }
          if (request.url === '/tiny') {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'image/png');
            response.end(png);
            return;
          }
          next();
        });
      },
    },
  ],
});
