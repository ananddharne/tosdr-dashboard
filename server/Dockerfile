# Backend image. Based on Playwright's image so the direct check's headless
# Chromium (and its system libraries) is available. Keep the tag's version
# in sync with playwright-core in package.json.
FROM mcr.microsoft.com/playwright:v1.48.2-jammy

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production \
    DIRECT_CHECK_CHROME_CHANNEL=bundled \
    PORT=3001
USER pwuser
EXPOSE 3001
CMD ["node", "dist/server.js"]
