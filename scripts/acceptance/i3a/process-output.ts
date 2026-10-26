export interface ProcessStreams { readonly exitCode: number; readonly stdout: string; readonly stderr: string; }
export interface ProcessEnvelope<T = unknown> {
  readonly schema: 'pharmacyflow-i3a-process-v1';
  readonly kind: string;
  readonly payload: T;
}

const PREFIX = 'PF_I3A_RESULT=';
export function parseProcessEnvelope<T = unknown>(streams: ProcessStreams, expectedKind: string): { envelope: ProcessEnvelope<T>; diagnostics: string } {
  if (!Number.isInteger(streams.exitCode)) throw new Error('Process exit code is malformed.');
  if (streams.exitCode !== 0) throw new Error(`Process failed with exit code ${streams.exitCode}.`);
  const lines = streams.stdout.split(/\r?\n/).filter(line => line.length > 0);
  if (lines.length !== 1 || !lines[0].startsWith(PREFIX)) throw new Error('Exactly one framed PostgreSQL result envelope is required.');
  let parsed: unknown;
  try { parsed = JSON.parse(lines[0].slice(PREFIX.length)); } catch { throw new Error('PostgreSQL result envelope JSON is malformed.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('PostgreSQL result envelope must be an object.');
  const value = parsed as Record<string, unknown>;
  if (Object.keys(value).sort().join('|') !== 'kind|payload|schema' || value.schema !== 'pharmacyflow-i3a-process-v1' || value.kind !== expectedKind)
    throw new Error('PostgreSQL result envelope contract mismatch.');
  return { envelope: value as unknown as ProcessEnvelope<T>, diagnostics: streams.stderr };
}
