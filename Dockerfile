FROM node:24.11.1-bookworm-slim@sha256:48abc13a19400ca3985071e287bd405a1d99306770eb81d61202fb6b65cf0b57

ARG VCS_REF=unknown
LABEL org.opencontainers.image.source="https://github.com/edgestream/recipes-plugin" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.description="Recipes Streamable HTTP MCP service"

WORKDIR /app
COPY --chown=node:node dist/recipes-mcp-http.mjs ./recipes-mcp-http.mjs
RUN mkdir /data && chown node:node /data

USER node
ENV NODE_ENV=production \
    RECIPES_MCP_HTTP_HOST=0.0.0.0 \
    RECIPES_MCP_HTTP_PORT=3000 \
    RECIPES_DATA_DIRECTORY=/data
VOLUME ["/data"]
EXPOSE 3000
ENTRYPOINT ["node", "/app/recipes-mcp-http.mjs"]
