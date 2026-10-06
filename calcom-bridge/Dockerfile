# Cal.com -> ERPNext bridge: single-process Node service, no runtime dependencies
# (native fetch + crypto). Same shape as ../ingest/Dockerfile.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json server.mjs ./
COPY lib ./lib

# Run as the built-in unprivileged node user.
USER node

EXPOSE 8080
CMD ["node", "server.mjs"]
