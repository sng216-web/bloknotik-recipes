export interface ImportPullRequest {
  url: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  mergedAt: string | null;
}

/** A pushed branch may outlive a failed PR request; retries must complete that step. */
export async function ensureImportPullRequest(
  list: () => Promise<ImportPullRequest[]>,
  create: () => Promise<string>,
): Promise<{ state: 'existing' | 'created' | 'merged'; url: string }> {
  const previous = await list();
  const open = previous.find((pr) => pr.state === 'OPEN');
  if (open) return { state: 'existing', url: open.url };
  const merged = previous.find((pr) => pr.mergedAt !== null || pr.state === 'MERGED');
  if (merged) return { state: 'merged', url: merged.url };
  if (previous.length) throw new Error('The import PR was closed; editorial review must explicitly reopen it');
  return { state: 'created', url: await create() };
}
