import type { DraftPayload } from '../types.js'

export async function apiCreate(
  draft: DraftPayload,
  repo: string,
  token: string,
): Promise<string> {
  const [owner, name] = repo.split('/')
  const response = await fetch(`https://api.github.com/repos/${owner}/${name}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'cluvo',
    },
    body: JSON.stringify({
      title: draft.title,
      body: draft.body,
      labels: draft.labels ?? [],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub API error ${response.status}: ${body}`)
  }

  const data = await response.json()
  return data.html_url
}
