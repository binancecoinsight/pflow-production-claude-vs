const SECRET_KEY = /(authorization|cookie|credential|password|passwd|pwd|secret|token|jwt|pgpass|connectionstring)/i;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const CONNECTION = /postgres(?:ql)?:\/\/[^\s"']+/gi;
const ASSIGNMENT = /\b(password|passwd|pwd|secret|token|cookie|authorization|credential|pgpass)\s*[:=]\s*[^\s,;"']+/gi;
export function sanitizeEvidence(value: unknown, key = ''): unknown {
  if (SECRET_KEY.test(key.toLowerCase().replace(/[^a-z0-9]/g, ''))) return '[REDACTED]';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try { return JSON.stringify(sanitizeEvidence(JSON.parse(trimmed))); } catch { /* sanitize as ordinary text */ }
    }
    return value.replace(JWT, '[REDACTED_JWT]').replace(CONNECTION, '[REDACTED_CONNECTION]').replace(ASSIGNMENT, '$1=[REDACTED]');
  }
  if (Array.isArray(value)) return value.map(item => sanitizeEvidence(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeEvidence(v, k)]));
  return value;
}
export function formatEvidence(caseId: string, payload: unknown, capturedAt: string): string {
  if (!/^[A-Z0-9_-]{3,100}$/.test(caseId) || !Number.isFinite(Date.parse(capturedAt))) throw new Error('Invalid evidence envelope.');
  return `${JSON.stringify({ schema: 'pharmacyflow-i3a-evidence-v2', caseId, capturedAt, payload: sanitizeEvidence(payload) })}\n`;
}
