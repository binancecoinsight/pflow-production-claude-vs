import type { CommandName, ExecutionAuthorization, PreflightObservation } from './contract.ts';
import { sanitizeEvidence } from './evidence.ts';
import { validatePreflight } from './preflight.ts';
export interface AcceptanceExecutor { execute(command: CommandName, authorization: ExecutionAuthorization): Promise<unknown>; }
export interface EvidenceSink { persist(record: Readonly<{ command: CommandName; classification: 'SYNTHETIC_RESULT' | 'SYNTHETIC_ERROR'; payload: unknown }>): Promise<void>; }
export async function runAuthorizedCommand(authorization: unknown, observation: PreflightObservation, executor: AcceptanceExecutor, evidence?: EvidenceSink): Promise<unknown> {
  if (!executor || typeof executor.execute !== 'function') throw new Error('ABORT: an injected executor is required.');
  const approved = validatePreflight(authorization, observation);
  try {
    const result = await executor.execute(observation.command, approved);
    if (evidence) await evidence.persist(Object.freeze({ command: observation.command, classification: 'SYNTHETIC_RESULT', payload: sanitizeEvidence(result) }));
    return result;
  } catch (error) {
    if (evidence) await evidence.persist(Object.freeze({ command: observation.command, classification: 'SYNTHETIC_ERROR', payload: sanitizeEvidence(error instanceof Error ? error.message : error) }));
    throw error;
  }
}
export class SyntheticExecutor implements AcceptanceExecutor {
  readonly calls: CommandName[] = [];
  async execute(command: CommandName): Promise<unknown> { this.calls.push(command); return Object.freeze({ classification: 'SYNTHETIC_ONLY', command, externalCalls: 0 }); }
}
