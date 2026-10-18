import { SiteHandoffSchema, handoffToImport } from '../../contracts/v2/handoff.js';
import { importApprovedContent } from './import-content.js';
export { SiteHandoffSchema, handoffToRecipe, handoffToImport } from '../../contracts/v2/handoff.js';
export { WireEventSchema, encodeEvent, decodeEvent } from '../../contracts/v2/events.js';
/** Explicit local staging only. Never publishes or deploys. Uses existing revision/identity ledger. */
export async function stageEditorialHandoff(input: unknown, root = process.cwd(), now = new Date()) {
  const handoff = SiteHandoffSchema.parse(input);
  return importApprovedContent(handoffToImport(handoff), root, now);
}

/** Both importer entry points normalize the same supported wire versions. */
export function normalizeEditorialImport(input: unknown): unknown {
  return input && typeof input === 'object' && 'schemaVersion' in input && input.schemaVersion === '2.0.0'
    ? handoffToImport(input) : input;
}
