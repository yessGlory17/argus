import * as os from 'os';
import * as path from 'path';

/**
 * Resolve the Claude Code config directory. Honors CLAUDE_CONFIG_DIR
 * (the same env var the CLI uses) so users who relocated their config
 * are picked up. Falls back to ~/.claude.
 */
export function getClaudeConfigDir(): string {
  const override = process.env.CLAUDE_CONFIG_DIR;
  if (override && override.trim()) {
    return override;
  }
  return path.join(os.homedir(), '.claude');
}
