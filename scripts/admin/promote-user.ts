#!/usr/bin/env ts-node
/* eslint-disable no-console */
const args = process.argv.slice(2);
const options = new Map<string, string>();
for (const arg of args) {
  if (!arg.startsWith('--')) continue;
  const [key, ...rest] = arg.slice(2).split('=');
  options.set(key, rest.length ? rest.join('=') : '');
}

const email = options.get('email');
const role = options.get('role');
const apiBase = options.get('api') || process.env.API_URL || 'http://localhost:3333';
const apiKey = options.get('key') || process.env.ADMIN_API_KEY;

const allowedRoles = new Set(['guardian', 'teacher', 'admin']);

if (!email || !role) {
  console.error('Usage: npm run admin:promote -- --email=user@example.com --role=teacher [--api=http://localhost:3333] [--key=...]');
  process.exit(1);
}

if (!allowedRoles.has(role)) {
  console.error(`Role must be one of: ${Array.from(allowedRoles).join(', ')}`);
  process.exit(1);
}

if (!apiKey) {
  console.error('ADMIN_API_KEY must be provided via --key or environment variable');
  process.exit(1);
}

async function main() {
  const url = `${apiBase.replace(/\/$/, '')}/admin/promote`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-api-key': apiKey
    },
    body: JSON.stringify({ email, role })
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Request failed (${response.status}): ${text}`);
    process.exit(1);
  }

  const data = await response.json();
  console.log('Promote result:', data);
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
