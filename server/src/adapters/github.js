// Mock GitHub adapter.
// Production swap: implement the same interface against the GitHub REST API
// (listRepos via GET /user/repos with the OAuth token granted at signup).

const REPOS = [
  { name: 'acme/payments-api', branch: 'main', lang: 'TypeScript', updated: '2 hours ago' },
  { name: 'acme/ledger-service', branch: 'main', lang: 'Go', updated: 'yesterday' },
  { name: 'acme/sdk-python', branch: 'develop', lang: 'Python', updated: '3 days ago' },
  { name: 'acme/webhooks-gateway', branch: 'main', lang: 'TypeScript', updated: 'last week' }
];

export async function listRepos() {
  return REPOS;
}
