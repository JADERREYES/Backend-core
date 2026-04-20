const fs = require('fs');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

function readEnvFile(envPath) {
  const content = fs.readFileSync(envPath, 'utf8');
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

async function main() {
  const env = readEnvFile(path.join(process.cwd(), '.env'));
  const mongoUri = env.MONGODB_URI;
  const dbName = env.MONGODB_DB_NAME || 'test';
  const email = process.env.SUPERADMIN_EMAIL || 'superadmin@menteamiga.com';
  const password = process.env.SUPERADMIN_PASSWORD || 'TempMente2026!';
  const rawDnsServers =
    process.env.MONGODB_DNS_SERVERS || env.MONGODB_DNS_SERVERS || '';

  if (!mongoUri) {
    throw new Error('MONGODB_URI no esta definido');
  }

  if (rawDnsServers.trim()) {
    const dnsServers = rawDnsServers
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (dnsServers.length > 0) {
      dns.setServers(dnsServers);
    }
  }

  const connection = await mongoose.createConnection(mongoUri, { dbName }).asPromise();
  const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
  const User = connection.model('ResetSuperadminUser', userSchema);

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();

  await User.findOneAndUpdate(
    { email },
    {
      $set: {
        email,
        passwordHash,
        role: 'superadmin',
        isActive: true,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
        isEmailVerified: false,
      },
    },
    { upsert: true, new: true },
  );

  console.log(
    JSON.stringify(
      {
        dbName,
        email,
        password,
        role: 'superadmin',
        isActive: true,
      },
      null,
      2,
    ),
  );

  await connection.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
