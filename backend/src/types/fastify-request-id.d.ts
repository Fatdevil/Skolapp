import type { FastifyPluginCallback } from 'fastify';

declare module 'fastify-request-id' {
  interface FastifyRequestIdOptions {
    generator?: () => string;
    useHeader?: boolean;
    headerName?: string;
    includeInResponse?: boolean;
  }

  const plugin: FastifyPluginCallback<FastifyRequestIdOptions>;
  export default plugin;
}
