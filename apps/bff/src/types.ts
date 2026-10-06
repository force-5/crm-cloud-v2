import type { Vms } from './vms/client';

declare module 'fastify' {
  interface FastifyRequest {
    /** VMS client bound to the session's access token (set by `requireAuth`). */
    vms: Vms;
    /** Audit-log subject for this request (email), when known. */
    auditUser?: string;
    auditTenant?: number;
    /** Target id for creates (the new record's id). */
    auditTarget?: string | number;
  }
  interface FastifyContextConfig {
    /** Audit action name for mutating routes, e.g. `account.publish`. */
    audit?: string;
  }
}

export {};
