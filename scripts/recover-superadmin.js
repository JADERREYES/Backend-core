const fs = require('fs');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const DEFAULT_SUPERADMIN_EMAIL = 'superadmin@menteamiga.com';
const SUPERADMIN_ROLE = 'superadmin';
const USER_ROLES = ['user', SUPERADMIN_ROLE];

function readEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const content = fs.readFileSync(envPath, 'utf8');
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=');

        if (separatorIndex === -1) {
          return [line, ''];
        }

        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

function getConfig(env, key, fallback = undefined) {
  return (process.env[key] || env[key] || fallback || '').trim();
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function configureTemporaryDnsOverride(env) {
  const rawServers = getConfig(env, 'MONGODB_DNS_SERVERS');

  if (!rawServers) {
    return;
  }

  const servers = rawServers
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);

  if (servers.length === 0) {
    throw new Error('MONGODB_DNS_SERVERS is defined but empty');
  }

  dns.setServers(servers);
  console.warn(
    `Using temporary MongoDB DNS SRV workaround: ${dns.getServers().join(', ')}. This is for local development only.`,
  );
}

async function main() {
  const env = readEnvFile(path.join(process.cwd(), '.env'));
  const mongoUri = getConfig(env, 'MONGODB_URI');
  const dbName = getConfig(env, 'MONGODB_DB_NAME', 'test');
  const email = normalizeEmail(
    getConfig(env, 'SUPERADMIN_EMAIL', DEFAULT_SUPERADMIN_EMAIL),
  );
  const newPassword = getConfig(env, 'RECOVERY_SUPERADMIN_PASSWORD');

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined');
  }

  if (!newPassword) {
    throw new Error('RECOVERY_SUPERADMIN_PASSWORD is required');
  }

  if (newPassword.length < 12) {
    throw new Error(
      'RECOVERY_SUPERADMIN_PASSWORD must be at least 12 characters',
    );
  }

  configureTemporaryDnsOverride(env);

  const connection = await mongoose
    .createConnection(mongoUri, {
      dbName,
      serverSelectionTimeoutMS: 10000,
    })
    .asPromise();

  try {
    const userSchema = new mongoose.Schema(
      {
        email: { type: String, required: true, trim: true, lowercase: true },
        name: { type: String },
        passwordHash: { type: String, required: true },
        role: { type: String, enum: USER_ROLES, default: 'user' },
        isActive: { type: Boolean, default: true },
        isEmailVerified: { type: Boolean, default: false },
      },
      { timestamps: true, collection: 'users' },
    );
    const User = connection.model('RecoverSuperadminUser', userSchema);

    const normalizedEmailQuery = {
      $expr: {
        $eq: [
          {
            $toLower: {
              $trim: {
                input: '$email',
              },
            },
          },
          email,
        ],
      },
    };

    const matchingUsers = await User.find(normalizedEmailQuery).exec();

    if (matchingUsers.length === 0) {
      throw new Error(`No user found for email ${email}`);
    }

    const exactEmailUsers = matchingUsers.filter(
      (user) => user.email === email,
    );
    const user = exactEmailUsers[0] || matchingUsers[0];

    if (matchingUsers.length > 1 && exactEmailUsers.length === 0) {
      throw new Error(
        `Found ${matchingUsers.length} users matching ${email} after trim/lowercase, but none has the exact normalized email. Fix duplicates manually before resetting access.`,
      );
    }

    user.set({
      email,
      passwordHash: await bcrypt.hash(newPassword, 10),
      role: SUPERADMIN_ROLE,
      isActive: true,
      updatedAt: new Date(),
    });

    await user.save();

    console.log(
      JSON.stringify(
        {
          dbName,
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          duplicateMatches: matchingUsers.length,
          passwordHashUpdated: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
