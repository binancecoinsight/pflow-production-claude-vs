import type { Command, ExecutionAuthorization, Observation } from './contract';
import { validatePreflight } from './preflight';
export interface ProtectedExecutor { execute(command:Command, authorization:ExecutionAuthorization, signal:AbortSignal):Promise<unknown> }
export async function runAuthorized(raw:unknown, observation:Observation, executor:ProtectedExecutor, signal:AbortSignal):Promise<unknown>{
  if(signal.aborted) throw new Error('PREFLIGHT_REJECTED:cancellation requested');
  const authorization=validatePreflight(raw,observation);
  try{return await executor.execute(observation.command,authorization,signal)}catch{throw new Error('EXECUTION_FAILED:protected executor failed')}
}
