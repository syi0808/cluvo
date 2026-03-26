export interface TestEnvironment {
  name: string
  env: Record<string, string | undefined>
  isTTY: boolean
  argv?: string[]
  description: string
}

export const environments = {
  localDev: {
    name: 'local-dev',
    isTTY: true,
    env: {
      GITHUB_TOKEN: undefined,
      GH_TOKEN: undefined,
      CI: undefined,
      CLUVO_DEBUG: undefined,
    },
    description: 'TTY available, no GitHub token, not CI',
  },
  localDevWithToken: {
    name: 'local-dev-with-token',
    isTTY: true,
    env: {
      GITHUB_TOKEN: 'ghp_test1234567890abcdef1234567890abcdef12',
      CI: undefined,
    },
    description: 'TTY available, GitHub token present',
  },
  ciGitHub: {
    name: 'ci-github-actions',
    isTTY: false,
    env: {
      CI: 'true',
      GITHUB_ACTIONS: 'true',
      GITHUB_TOKEN: 'ghp_ci_token_1234567890abcdef123456',
    },
    description: 'GitHub Actions — no TTY, token available',
  },
  ciGeneric: {
    name: 'ci-generic',
    isTTY: false,
    env: {
      CI: 'true',
      GITHUB_TOKEN: undefined,
    },
    description: 'Generic CI — no TTY, no token',
  },
  pipe: {
    name: 'piped-output',
    isTTY: false,
    env: {
      CI: undefined,
      GITHUB_TOKEN: undefined,
    },
    description: 'Piped output (e.g., my-cli | grep error)',
  },
  debug: {
    name: 'debug-mode',
    isTTY: true,
    env: {
      CLUVO_DEBUG: '1',
      GITHUB_TOKEN: undefined,
    },
    description: 'Debug logging enabled',
  },
  sensitiveEnv: {
    name: 'sensitive-env',
    isTTY: true,
    env: {
      GITHUB_TOKEN: 'ghp_secret_real_token_abcdef1234567890',
      AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      DATABASE_URL: 'postgres://admin:s3cretP4ss@db.internal:5432/prod',
      API_KEY: 'sk-proj-abc123def456ghi789',
    },
    description: 'Multiple sensitive env vars present',
  },
} as const satisfies Record<string, TestEnvironment>

export type EnvironmentName = keyof typeof environments
