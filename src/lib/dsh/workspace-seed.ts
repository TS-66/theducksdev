/**
 * DSH Web — seed workspace.
 *
 * A miniature, believable TypeScript repo ("greeting-service") seeded into
 * every new session's virtual filesystem so file/shell tools have something
 * real to operate on immediately. Mirrors the demo-repo ergonomics of
 * deepseek-ai/deepseek-harness sessions.
 */

export const SEED_WORKSPACE: Record<string, string> = {
  'README.md': `# greeting-service

A tiny greeting microservice library used as the DSH Web sample workspace.

It exposes a \`greet()\` helper plus a thin CLI that prints salutations for a
list of names. Everything is plain TypeScript with zero runtime dependencies.

## Install

\`\`\`bash
bun install
\`\`\`

## Scripts

| Script         | Description                              |
| -------------- | ---------------------------------------- |
| \`bun run dev\`  | Run the CLI in watch mode                |
| \`bun run build\`| Compile to \`dist/\`                      |
| \`bun test\`     | Execute the unit tests                   |

## Usage

\`\`\`ts
import { greet, GreetingService } from './src/greet';

greet('Ada');                          // "Hello, Ada!"
const svc = new GreetingService({ salutation: 'Howdy' });
svc.greet('Grace', { enthusiasm: 2 }); // "Howdy, Grace!!"
\`\`\`

## Layout

- \`src/greet.ts\` — core greeting logic
- \`src/utils/format.ts\` — string formatting helpers
- \`tests/\` — unit tests
`,
  'package.json': `{
  "name": "greeting-service",
  "version": "1.2.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "dev": "node --experimental-strip-types src/index.ts",
    "build": "tsc -p tsconfig.json",
    "test": "node --test tests/"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.7.0"
  },
  "engines": {
    "node": ">=20"
  }
}
`,
  'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"]
}
`,
  'src/index.ts': `import { GreetingService } from './greet.js';

const DEFAULT_NAMES = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing'];

function main(argv: string[]): void {
  const names = argv.length > 0 ? argv : DEFAULT_NAMES;
  const service = new GreetingService();

  for (const name of names) {
    console.log(service.greet(name));
  }

  console.log(\`\${names.length} greeting(s) generated.\`);
}

const invokedDirectly = process.argv[1]?.endsWith('index.ts') ?? false;
if (invokedDirectly) {
  main(process.argv.slice(2));
}
`,
  'src/greet.ts': `import { capitalize } from './utils/format.js';

export interface GreetOptions {
  /** Leading word, defaults to "Hello". */
  salutation?: string;
  /** Number of trailing exclamation marks (0-3). */
  enthusiasm?: number;
}

export interface GreetingStats {
  total: number;
  last: string;
}

/** One-off functional greeting. */
export function greet(name: string, options: GreetOptions = {}): string {
  const service = new GreetingService(options);
  return service.greet(name);
}

/** Stateful greeter that keeps simple counters. */
export class GreetingService {
  private readonly salutation: string;
  private readonly enthusiasm: number;
  private stats: GreetingStats = { total: 0, last: '' };

  constructor(options: GreetOptions = {}) {
    this.salutation = options.salutation ?? 'Hello';
    this.enthusiasm = Math.min(3, Math.max(0, options.enthusiasm ?? 1));
  }

  greet(name: string): string {
    const cleanName = capitalize(name.trim());
    const bangs = '!'.repeat(this.enthusiasm);
    const message = \`\${this.salutation}, \${cleanName}\${bangs}\`;
    this.stats = { total: this.stats.total + 1, last: message };
    return message;
  }

  getStats(): Readonly<GreetingStats> {
    return this.stats;
  }
}
`,
  'src/utils/format.ts': `/** Uppercase the first letter of each word ("grace hopper" -> "Grace Hopper"). */
export function titleCase(input: string): string {
  return input
    .split(/\\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');
}

/** Uppercase just the first letter, preserving the rest. */
export function capitalize(input: string): string {
  if (input.length === 0) return input;
  return input[0]!.toUpperCase() + input.slice(1);
}

/** Truncate long strings with an ellipsis marker. */
export function truncate(input: string, max = 40): string {
  if (input.length <= max) return input;
  return \`\${input.slice(0, Math.max(0, max - 1))}…\`;
}
`,
  'tests/greet.test.ts': `import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { greet, GreetingService } from '../src/greet.js';
import { capitalize, titleCase, truncate } from '../src/utils/format.js';

describe('greet()', () => {
  it('uses the default salutation and one bang', () => {
    assert.equal(greet('ada'), 'Hello, Ada!');
  });

  it('honours custom options', () => {
    assert.equal(greet('grace', { salutation: 'Howdy', enthusiasm: 2 }), 'Howdy, Grace!!');
  });

  it('clamps enthusiasm to [0, 3]', () => {
    assert.equal(greet('linus', { enthusiasm: 9 }).endsWith('!!!!'), false);
  });
});

describe('GreetingService', () => {
  it('tracks stats across calls', () => {
    const svc = new GreetingService();
    svc.greet('a');
    svc.greet('b');
    const stats = svc.getStats();
    assert.equal(stats.total, 2);
    assert.match(stats.last, /B!$/);
  });
});

describe('format helpers', () => {
  it('capitalizes first letter only', () => {
    assert.equal(capitalize('hello WORLD'), 'Hello WORLD');
  });
  it('title-cases every word', () => {
    assert.equal(titleCase('grace  hopper'), 'Grace Hopper');
  });
  it('truncates with ellipsis', () => {
    assert.ok(truncate('x'.repeat(80), 10).length <= 10);
  });
});
`,
};
