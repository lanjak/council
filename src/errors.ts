export class CouncilError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'CouncilError';
  }
}

export function formatError(error: unknown): string {
  if (error instanceof CouncilError) {
    return `error: ${error.code}: ${error.message}\nhelp: npx -y @lanjak/council setup`;
  }
  if (error instanceof Error) {
    return `error: ${error.message}\nhelp: npx -y @lanjak/council --help`;
  }
  return `error: ${String(error)}\nhelp: npx -y @lanjak/council --help`;
}
