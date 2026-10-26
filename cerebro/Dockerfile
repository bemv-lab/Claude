FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
ENV NODE_ENV=production PORT=3000 CEREBRO_DB=/dados/cerebro.db NODE_NO_WARNINGS=1
VOLUME /dados
EXPOSE 3000
CMD ["npm", "start"]
