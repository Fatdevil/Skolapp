const { argv, env, exit } = process;

const allowedRoles = new Set(['guardian', 'teacher', 'admin'] as const);

type Role = 'guardian' | 'teacher' | 'admin';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const raw = argv.find((value) => value.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : undefined;
}

async function main() {
  const email = getArg('email') ?? env.EMAIL;
  const roleArg = getArg('role') ?? env.ROLE;
  const apiUrl = getArg('api') ?? env.API_URL ?? 'http://localhost:3333';
  const apiKey = env.ADMIN_API_KEY;

  if (!email || !roleArg) {
    console.error('Usage: ts-node scripts/admin/promote-user.ts --email=user@example.com --role=teacher [--api=http://localhost:3333]');
    exit(1);
  }
  if (!apiKey) {
    console.error('ADMIN_API_KEY environment variable is required');
    exit(1);
  }
  const role = roleArg.toLowerCase();
  if (!allowedRoles.has(role as Role)) {
    console.error(`Invalid role: ${roleArg}. Allowed: guardian, teacher, admin`);
    exit(1);
  }

  try {
    const response = await fetch(`${apiUrl}/admin/promote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-api-key': apiKey
      },
      body: JSON.stringify({ email, role })
    });

    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.json();
        if (errorBody?.error) {
          message = errorBody.error;
        }
      } catch {
        // ignore json parse errors
      }
      console.error(`Promote failed: ${message}`);
      exit(1);
    }

    const data = (await response.json()) as { user: { email: string; role: Role } };
    console.log(`Promoted ${data.user.email} to ${data.user.role}`);
  } catch (error) {
    console.error('Failed to call promote API:', error);
    exit(1);
  }
}

main();
