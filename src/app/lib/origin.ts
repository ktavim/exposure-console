const DEFAULT_PORTS: Record<string, number> = { http: 80, https: 443 };

/** An origin as the backend formats it: the port only when it is not the scheme's default. */
export function formatOrigin(o: { scheme: string; host: string; port: number }): string {
  const host = o.host.includes(':') ? `[${o.host}]` : o.host;
  return DEFAULT_PORTS[o.scheme] === o.port ? `${o.scheme}://${host}` : `${o.scheme}://${host}:${o.port}`;
}
