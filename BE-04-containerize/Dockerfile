FROM node:22-alpine

WORKDIR /app

# install deps first so this layer is cached when only source changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY db ./db

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
