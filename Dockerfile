FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/ipaddr.js ./node_modules/ipaddr.js
COPY server ./server
ENV HOST=0.0.0.0 PORT=1420
EXPOSE 1420
USER node
CMD ["node","server/start.mjs"]
