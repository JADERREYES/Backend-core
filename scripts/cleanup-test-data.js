const fs = require('fs');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');

function loadEnvFile(envPath) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) return;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

const TEST_KEYWORD_REGEX = /\b(e2e|demo|mock|fake|seed|qa)\b/i;
const TEST_EMAIL_REGEX =
  /(^|[+._-])(e2e|demo|mock|fake|seed|qa|test)([+._-]|@)|\.test$|@example\.com$/i;

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isTestEmail(value) {
  return TEST_EMAIL_REGEX.test(asText(value));
}

function isTestText(value) {
  return TEST_KEYWORD_REGEX.test(asText(value));
}

function isTestUser(user) {
  return (
    isTestEmail(user.email) ||
    isTestText(user.name) ||
    isTestText(user.phone)
  );
}

function isTestChat(chat, testUserIds) {
  return (
    testUserIds.has(String(chat.userId || '')) ||
    isTestText(chat.title)
  );
}

function isTestSubscriptionRequest(item, testUserIds) {
  return (
    testUserIds.has(String(item.userId || '')) ||
    isTestEmail(item.userEmail) ||
    isTestText(item.userName) ||
    isTestText(item.planCode) ||
    isTestText(item.planName) ||
    isTestText(item.paidAtReference) ||
    isTestText(item.proofOriginalName) ||
    isTestText(item.receiptFileName)
  );
}

function isTestDocument(item) {
  return (
    isTestText(item.title) ||
    isTestText(item.originalFileName) ||
    isTestText(item.storedFileName) ||
    isTestText(item.author)
  );
}

function isTestSubscription(item, testUserIds) {
  return (
    testUserIds.has(String(item.userId || '')) ||
    isTestText(item.planCode) ||
    isTestText(item.planName) ||
    isTestText(item.notes)
  );
}

async function main() {
  const execute = process.argv.includes('--execute');
  const projectRoot = path.resolve(__dirname, '..');
  loadEnvFile(path.join(projectRoot, '.env'));

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  const dnsServers = (process.env.MONGODB_DNS_SERVERS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!uri || !dbName) {
    throw new Error('Faltan MONGODB_URI o MONGODB_DB_NAME en Backend-core/.env');
  }

  if (dnsServers.length > 0) {
    dns.setServers(dnsServers);
  }

  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });

  const userModel = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const chatModel = mongoose.model('Chat', new mongoose.Schema({}, { strict: false }));
  const messageModel = mongoose.model('Message', new mongoose.Schema({}, { strict: false }));
  const subscriptionModel = mongoose.model(
    'Subscription',
    new mongoose.Schema({}, { strict: false }),
  );
  const subscriptionRequestModel = mongoose.model(
    'SubscriptionRequest',
    new mongoose.Schema({}, { strict: false }),
  );
  const documentModel = mongoose.model(
    'AdminDocument',
    new mongoose.Schema({}, { strict: false }),
  );
  const chunkModel = mongoose.model(
    'DocumentChunk',
    new mongoose.Schema({}, { strict: false }),
  );

  const [users, chats, subscriptions, requests, documents] = await Promise.all([
    userModel.find({}).lean().exec(),
    chatModel.find({}).lean().exec(),
    subscriptionModel.find({}).lean().exec(),
    subscriptionRequestModel.find({}).lean().exec(),
    documentModel.find({}).lean().exec(),
  ]);

  const testUsers = users.filter(isTestUser);
  const testUserIds = new Set(testUsers.map((item) => String(item._id)));
  const testChats = chats.filter((item) => isTestChat(item, testUserIds));
  const testChatIds = new Set(testChats.map((item) => String(item._id)));
  const testMessages = await messageModel
    .find({
      $or: [
        { chatId: { $in: [...testChatIds] } },
        { senderId: { $in: [...testUserIds] } },
      ],
    })
    .lean()
    .exec();
  const testSubscriptions = subscriptions.filter((item) =>
    isTestSubscription(item, testUserIds),
  );
  const testRequests = requests.filter((item) =>
    isTestSubscriptionRequest(item, testUserIds),
  );
  const testDocuments = documents.filter(isTestDocument);
  const testDocumentIds = testDocuments.map((item) => item._id);
  const testChunks = await chunkModel
    .find({ documentId: { $in: testDocumentIds } })
    .lean()
    .exec();

  const uploadsRoot = path.join(projectRoot, 'uploads');
  const uploadFolders = [
    path.join(uploadsRoot, 'documents'),
    path.join(uploadsRoot, 'subscription-proofs'),
  ];
  const testFiles = uploadFolders.flatMap((folder) => {
    if (!fs.existsSync(folder)) return [];
    return fs
      .readdirSync(folder)
      .filter((name) => TEST_KEYWORD_REGEX.test(name))
      .map((name) => path.join(folder, name));
  });

  const summary = {
    dbName,
    mode: execute ? 'EXECUTE' : 'DRY_RUN',
    users: testUsers.length,
    chats: testChats.length,
    messages: testMessages.length,
    subscriptions: testSubscriptions.length,
    subscriptionRequests: testRequests.length,
    documents: testDocuments.length,
    documentChunks: testChunks.length,
    uploadFiles: testFiles.length,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!execute) {
    console.log(
      'Dry run completado. Ejecuta `npm run cleanup:test-data -- --execute` para borrar esos registros.',
    );
    await mongoose.disconnect();
    return;
  }

  await Promise.all([
    testMessages.length
      ? messageModel.deleteMany({ _id: { $in: testMessages.map((item) => item._id) } }).exec()
      : Promise.resolve(),
    testChats.length
      ? chatModel.deleteMany({ _id: { $in: testChats.map((item) => item._id) } }).exec()
      : Promise.resolve(),
    testSubscriptions.length
      ? subscriptionModel
          .deleteMany({ _id: { $in: testSubscriptions.map((item) => item._id) } })
          .exec()
      : Promise.resolve(),
    testRequests.length
      ? subscriptionRequestModel
          .deleteMany({ _id: { $in: testRequests.map((item) => item._id) } })
          .exec()
      : Promise.resolve(),
    testChunks.length
      ? chunkModel.deleteMany({ _id: { $in: testChunks.map((item) => item._id) } }).exec()
      : Promise.resolve(),
    testDocuments.length
      ? documentModel
          .deleteMany({ _id: { $in: testDocuments.map((item) => item._id) } })
          .exec()
      : Promise.resolve(),
    testUsers.length
      ? userModel.deleteMany({ _id: { $in: testUsers.map((item) => item._id) } }).exec()
      : Promise.resolve(),
  ]);

  testFiles.forEach((filePath) => {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.warn(`No se pudo borrar ${filePath}: ${error.message}`);
    }
  });

  console.log('Limpieza completada.');
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
