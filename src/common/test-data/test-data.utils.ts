const TEST_KEYWORD_REGEX = /\b(e2e|demo|mock|fake|seed|qa)\b/i;
const TEST_EMAIL_REGEX =
  /(^|[+._-])(e2e|demo|mock|fake|seed|qa|test)([+._-]|@)|\.test$|@example\.com$/i;

const stringify = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const isTestEmail = (value: unknown) =>
  TEST_EMAIL_REGEX.test(stringify(value));

export const isTestText = (value: unknown) =>
  TEST_KEYWORD_REGEX.test(stringify(value));

export const isTestUserRecord = (user?: {
  email?: unknown;
  name?: unknown;
  phone?: unknown;
}) =>
  isTestEmail(user?.email) ||
  isTestText(user?.name) ||
  isTestText(user?.phone);

export const isTestChatRecord = (chat?: {
  title?: unknown;
  userEmail?: unknown;
}) =>
  isTestText(chat?.title) || isTestEmail(chat?.userEmail);

export const isTestDocumentRecord = (document?: {
  title?: unknown;
  originalFileName?: unknown;
  storedFileName?: unknown;
  author?: unknown;
}) =>
  isTestText(document?.title) ||
  isTestText(document?.originalFileName) ||
  isTestText(document?.storedFileName) ||
  isTestText(document?.author);

export const isTestSubscriptionRequestRecord = (request?: {
  userEmail?: unknown;
  userName?: unknown;
  planCode?: unknown;
  planName?: unknown;
  paidAtReference?: unknown;
  proofOriginalName?: unknown;
  receiptFileName?: unknown;
}) =>
  isTestEmail(request?.userEmail) ||
  isTestText(request?.userName) ||
  isTestText(request?.planCode) ||
  isTestText(request?.planName) ||
  isTestText(request?.paidAtReference) ||
  isTestText(request?.proofOriginalName) ||
  isTestText(request?.receiptFileName);

export const isTestSubscriptionRecord = (subscription?: {
  planCode?: unknown;
  planName?: unknown;
  notes?: unknown;
}) =>
  isTestText(subscription?.planCode) ||
  isTestText(subscription?.planName) ||
  isTestText(subscription?.notes);

export const buildLooseRegex = (source: RegExp) =>
  new RegExp(source.source, source.flags.replace('g', ''));

export const TEST_KEYWORD_QUERY_REGEX = buildLooseRegex(TEST_KEYWORD_REGEX);
export const TEST_EMAIL_QUERY_REGEX = buildLooseRegex(TEST_EMAIL_REGEX);
