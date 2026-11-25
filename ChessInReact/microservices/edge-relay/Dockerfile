# ChessInReact - Edge Spectator Relay Microservice (Spec 08 § 8.1)
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Copy microservice source
COPY edge-relay/src ./src

EXPOSE 4000

CMD ["node", "src/index.js"]

