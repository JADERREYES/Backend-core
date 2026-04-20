const fs = require('fs');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

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
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

function getConfig(env, key, fallback = '') {
  return (process.env[key] || env[key] || fallback).trim();
}

function normalizeCode(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

async function main() {
  const env = readEnvFile(path.join(process.cwd(), '.env'));
  const mongoUri = getConfig(env, 'MONGODB_URI');
  const dbName = getConfig(env, 'MONGODB_DB_NAME', 'menteamiga_prod');
  const rawDnsServers = getConfig(env, 'MONGODB_DNS_SERVERS');
  const superadminEmail = getConfig(
    env,
    'SUPERADMIN_EMAIL',
    'superadmin@menteamiga.com',
  ).toLowerCase();
  const superadminPassword = getConfig(
    env,
    'SUPERADMIN_PASSWORD',
    'TempMente2026!',
  );

  if (!mongoUri) {
    throw new Error('MONGODB_URI no esta definido');
  }

  if (rawDnsServers) {
    const dnsServers = rawDnsServers
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (dnsServers.length > 0) {
      dns.setServers(dnsServers);
    }
  }

  const connection = await mongoose
    .createConnection(mongoUri, {
      dbName,
      serverSelectionTimeoutMS: 10000,
    })
    .asPromise();

  try {
    const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
    const planSchema = new mongoose.Schema({}, { strict: false, collection: 'plans' });
    const paymentMethodSchema = new mongoose.Schema(
      {},
      { strict: false, collection: 'paymentmethods' },
    );
    const settingSchema = new mongoose.Schema(
      {},
      { strict: false, collection: 'settings' },
    );

    const User = connection.model('BootstrapUser', userSchema);
    const Plan = connection.model('BootstrapPlan', planSchema);
    const PaymentMethod = connection.model(
      'BootstrapPaymentMethod',
      paymentMethodSchema,
    );
    const Setting = connection.model('BootstrapSetting', settingSchema);

    const now = new Date();
    const passwordHash = await bcrypt.hash(superadminPassword, 10);

    await User.findOneAndUpdate(
      { email: superadminEmail },
      {
        $set: {
          email: superadminEmail,
          name: 'Super Admin',
          passwordHash,
          role: 'superadmin',
          isActive: true,
          isEmailVerified: true,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
          twoFactorEnabled: false,
          twoFactorMethod: 'email',
        },
      },
      { upsert: true, new: true },
    );

    await Setting.findOneAndUpdate(
      { key: 'global' },
      {
        $set: {
          key: 'global',
          platformName: 'MenteAmiga-AI',
          baseUrl: 'http://localhost:5173',
          timezone: 'America/Bogota',
          language: 'es',
          dailyLimit: Number(getConfig(env, 'FREE_DAILY_LIMIT', '20')),
          monthlyLimit: Number(getConfig(env, 'FREE_MONTHLY_LIMIT', '500')),
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, new: true },
    );

    const plans = [
      {
        name: 'Free',
        code: 'free',
        description: 'Plan base gratuito',
        category: 'free',
        price: 0,
        currency: 'COP',
        durationDays: 30,
        tokenLimit: 100,
        dailyMessageLimit: 0,
        monthlyMessageLimit: 100,
        features: [],
        limits: {
          maxChatsPerMonth: 10,
          maxMessagesPerMonth: 100,
          maxDocumentsMB: 50,
          monthlyTokens: 100,
          extraTokens: 0,
        },
        isActive: true,
        isDefault: true,
        isCustomizable: false,
        sortOrder: 0,
        displayOrder: 0,
      },
      {
        name: 'Trial',
        code: 'trial',
        description: 'Acceso de prueba por tiempo limitado',
        category: 'trial',
        price: 0,
        currency: 'COP',
        durationDays: 5,
        tokenLimit: 250,
        dailyMessageLimit: 0,
        monthlyMessageLimit: 200,
        features: ['trial'],
        limits: {
          maxChatsPerMonth: 20,
          maxMessagesPerMonth: 200,
          maxDocumentsMB: 75,
          monthlyTokens: 250,
          extraTokens: 0,
        },
        isActive: true,
        isDefault: false,
        isCustomizable: false,
        sortOrder: 1,
        displayOrder: 1,
      },
      {
        name: 'Premium Mensual',
        code: 'premium-mensual',
        description: 'Plan premium mensual para usuarios activos',
        category: 'premium',
        price: 29900,
        currency: 'COP',
        durationDays: 30,
        tokenLimit: 10000,
        dailyMessageLimit: 0,
        monthlyMessageLimit: 5000,
        features: ['premium'],
        limits: {
          maxChatsPerMonth: 500,
          maxMessagesPerMonth: 5000,
          maxDocumentsMB: 250,
          monthlyTokens: 10000,
          extraTokens: 0,
        },
        isActive: true,
        isDefault: false,
        isCustomizable: true,
        sortOrder: 2,
        displayOrder: 2,
      },
    ];

    for (const plan of plans) {
      await Plan.findOneAndUpdate(
        { code: normalizeCode(plan.code) },
        {
          $set: {
            ...plan,
            code: normalizeCode(plan.code),
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, new: true },
      );
    }

    const paymentMethods = [
      {
        name: 'Nequi',
        code: 'nequi',
        provider: 'Nequi',
        type: 'wallet',
        accountLabel: 'Numero de pago',
        accountValue: '3001234567',
        accountNumber: '3001234567',
        accountHolder: 'MenteAmiga',
        holderName: 'MenteAmiga',
        instructions:
          'Realiza la transferencia y comparte el comprobante desde la app.',
        isActive: true,
        sortOrder: 0,
        displayOrder: 0,
      },
      {
        name: 'Bancolombia',
        code: 'bancolombia',
        provider: 'Bancolombia',
        type: 'bank_transfer',
        accountLabel: 'Cuenta de ahorros',
        accountValue: '12345678901',
        accountNumber: '12345678901',
        accountHolder: 'MenteAmiga SAS',
        holderName: 'MenteAmiga SAS',
        instructions:
          'Consigna o transfiere a la cuenta indicada y adjunta el soporte de pago.',
        isActive: true,
        sortOrder: 1,
        displayOrder: 1,
      },
    ];

    for (const method of paymentMethods) {
      await PaymentMethod.findOneAndUpdate(
        { code: normalizeCode(method.code) },
        {
          $set: {
            ...method,
            code: normalizeCode(method.code),
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, new: true },
      );
    }

    console.log(
      JSON.stringify(
        {
          dbName,
          superadminEmail,
          seededPlans: plans.map((plan) => normalizeCode(plan.code)),
          seededPaymentMethods: paymentMethods.map((method) =>
            normalizeCode(method.code),
          ),
          settingsKey: 'global',
          passwordRotationRecommended: true,
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
