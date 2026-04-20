import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { join } from 'path';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AdminDocument } from '../src/modules/documents/schemas/document.schema';
import { DocumentChunk } from '../src/modules/documents/schemas/document-chunk.schema';

const adminEmail =
  process.env.E2E_SUPERADMIN_EMAIL || 'superadmin@menteamiga.com';
const adminPassword =
  process.env.E2E_SUPERADMIN_PASSWORD || 'MenteAmiga.Temp.2026!';

jest.setTimeout(30000);

describe('Admin critical flows (e2e)', () => {
  let app: INestApplication<App>;
  let token = '';
  let createdUserId = '';
  let documentModel: Model<AdminDocument>;
  let chunkModel: Model<DocumentChunk>;

  const waitForDocumentProcessing = async (documentId: string) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const document = await documentModel.findById(documentId).lean().exec();
      if (
        document &&
        ['indexed', 'failed'].includes(document.processingStatus)
      ) {
        return document;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return documentModel.findById(documentId).lean().exec();
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    documentModel = app.get<Model<AdminDocument>>(
      getModelToken(AdminDocument.name),
    );
    chunkModel = app.get<Model<DocumentChunk>>(
      getModelToken(DocumentChunk.name),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects protected admin routes without JWT', async () => {
    await request(app.getHttpServer()).get('/admin/dashboard').expect(401);
    await request(app.getHttpServer()).get('/documents').expect(401);
  });

  it('logs in as superadmin', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: adminEmail,
        password: adminPassword,
        adminOnly: true,
      })
      .expect(201);
    const body = response.body as {
      token: string;
      user: { role: string };
    };

    expect(body.token).toEqual(expect.any(String));
    expect(body.user.role).toBe('superadmin');
    token = body.token;
  });

  it('returns consolidated admin dashboard metrics', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = response.body as {
      stats: Record<string, number>;
      recentChats: unknown[];
    };

    expect(typeof body.stats.totalUsers).toBe('number');
    expect(typeof body.stats.activeUsers).toBe('number');
    expect(typeof body.stats.totalChats).toBe('number');
    expect(typeof body.stats.premiumUsers).toBe('number');
    expect(typeof body.stats.totalDocuments).toBe('number');
    expect(Array.isArray(body.recentChats)).toBe(true);
  });

  it('supports account security flows without changing the superadmin account', async () => {
    const suffix = Date.now();
    const originalEmail = `e2e-security-${suffix}@menteamiga.test`;
    const changedEmail = `e2e-security-updated-${suffix}@menteamiga.test`;
    const originalPassword = 'MenteAmiga.Temp.2026!';
    const changedPassword = 'MenteAmiga.Temp.2026.Updated!';

    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: originalEmail,
        name: 'E2E Security User',
        password: originalPassword,
        role: 'user',
        isActive: true,
      })
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: originalEmail, password: originalPassword })
      .expect(201);
    const loginBody = loginResponse.body as { token: string };

    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${loginBody.token}`)
      .send({
        currentPassword: originalPassword,
        newPassword: changedPassword,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: originalEmail, password: originalPassword })
      .expect(401);

    const changedLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: originalEmail, password: changedPassword })
      .expect(201);
    const changedLogin = changedLoginResponse.body as { token: string };

    const emailRequestResponse = await request(app.getHttpServer())
      .post('/auth/email-change/request')
      .set('Authorization', `Bearer ${changedLogin.token}`)
      .send({
        currentPassword: changedPassword,
        newEmail: changedEmail,
      })
      .expect(201);
    const emailRequest = emailRequestResponse.body as { devCode?: string };
    expect(typeof emailRequest.devCode).toBe('string');

    await request(app.getHttpServer())
      .post('/auth/email-change/confirm')
      .set('Authorization', `Bearer ${changedLogin.token}`)
      .send({ code: emailRequest.devCode })
      .expect(201);

    const newEmailLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: changedEmail, password: changedPassword })
      .expect(201);
    const newEmailLogin = newEmailLoginResponse.body as { token: string };

    const twoFactorRequestResponse = await request(app.getHttpServer())
      .post('/auth/2fa/request')
      .set('Authorization', `Bearer ${newEmailLogin.token}`)
      .send({
        currentPassword: changedPassword,
        method: 'email',
      })
      .expect(201);
    const twoFactorRequest = twoFactorRequestResponse.body as {
      devCode?: string;
    };
    expect(typeof twoFactorRequest.devCode).toBe('string');

    await request(app.getHttpServer())
      .post('/auth/2fa/confirm')
      .set('Authorization', `Bearer ${newEmailLogin.token}`)
      .send({ code: twoFactorRequest.devCode })
      .expect(201);

    const twoFactorLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: changedEmail, password: changedPassword })
      .expect(201);
    const twoFactorLogin = twoFactorLoginResponse.body as {
      twoFactorRequired: boolean;
      devCode?: string;
    };
    expect(twoFactorLogin.twoFactorRequired).toBe(true);
    expect(typeof twoFactorLogin.devCode).toBe('string');

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: changedEmail,
        password: changedPassword,
        twoFactorCode: twoFactorLogin.devCode,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: changedEmail,
        password: changedPassword,
        twoFactorCode: twoFactorLogin.devCode,
      })
      .expect(401);
  });

  it('deletes a user account and rejects the deleted credentials', async () => {
    const suffix = Date.now();
    const email = `e2e-delete-${suffix}@menteamiga.test`;
    const password = 'MenteAmiga.Temp.2026!';

    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email,
        name: 'E2E Delete User',
        password,
        role: 'user',
        isActive: true,
      })
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);
    const loginBody = loginResponse.body as { token: string };

    await request(app.getHttpServer())
      .put('/profiles/me')
      .set('Authorization', `Bearer ${loginBody.token}`)
      .send({
        displayName: 'E2E Deleted Profile',
        bio: 'Temporary profile for delete-account e2e.',
      })
      .expect(200);

    await request(app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', `Bearer ${loginBody.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(401);

    await request(app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', `Bearer ${loginBody.token}`)
      .expect(401);
  });

  it('lists RAG documents with pagination metadata', async () => {
    const response = await request(app.getHttpServer())
      .get('/documents?page=1&limit=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = response.body as {
      data: unknown[];
      meta: Record<string, number | boolean>;
    };

    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(5);
    expect(typeof body.meta.total).toBe('number');
    expect(typeof body.meta.totalPages).toBe('number');
  });

  it('creates and reads a manual RAG document', async () => {
    const response = await request(app.getHttpServer())
      .post('/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `E2E RAG Manual ${Date.now()}`,
        category: 'faq',
        status: 'published',
        version: '1.0.0',
        author: 'E2E',
        content:
          'MenteAmiga e2e document for retrieval diagnostics and indexing validation.',
      })
      .expect(201);
    const created = response.body as { id: string; title: string };

    await request(app.getHttpServer())
      .get(`/documents/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('processes a local uploaded document without exposing storage paths', async () => {
    const fixturePath = join(
      process.cwd(),
      'uploads',
      'documents',
      '1776312433872-texto1.docx',
    );

    const uploadResponse = await request(app.getHttpServer())
      .post('/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('title', `E2E Upload ${Date.now()}`)
      .field('category', 'faq')
      .field('status', 'published')
      .attach('file', fixturePath, {
        filename: 'e2e-upload.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      .expect(201);
    const uploaded = uploadResponse.body as {
      id: string;
      fileUrl?: string;
      storageKey?: string;
      storagePath?: string;
      hasFile: boolean;
    };

    expect(uploaded.hasFile).toBe(true);
    expect(uploaded.fileUrl || '').toBe('');
    expect(uploaded.storageKey).toBeUndefined();
    expect(uploaded.storagePath).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/documents/${uploaded.id}/download`)
      .expect(401);

    const processed = await waitForDocumentProcessing(uploaded.id);
    expect(processed?.processingStatus).toBe('indexed');
    expect(processed?.extractionStatus).toBe('completed');
  }, 20000);

  it('rejects unsafe remote document storage locations', async () => {
    const unsafeDocument = await documentModel.create({
      title: `E2E Unsafe Remote ${Date.now()}`,
      category: 'faq',
      status: 'published',
      version: '1.0.0',
      author: 'E2E',
      sourceType: 'file',
      originalFileName: 'unsafe.pdf',
      mimeType: 'application/pdf',
      storageProvider: 'vercel-blob',
      storageKey: 'https://127.0.0.1/internal.pdf',
      processingStatus: 'indexed',
      extractionStatus: 'completed',
    });

    await request(app.getHttpServer())
      .get(`/documents/${unsafeDocument.id}/download`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('uses keyword RAG for accented Spanish text and reports the observed mode', async () => {
    const documentId = new Types.ObjectId();
    await documentModel.create({
      _id: documentId,
      title: `E2E RAG Acentos ${Date.now()}`,
      category: 'faq',
      status: 'published',
      version: '1.0.0',
      author: 'E2E',
      content:
        'La emoción, la niñez, la depresión y la acción requieren apoyo claro.',
      sourceType: 'manual',
      processingStatus: 'indexed',
      indexingStatus: 'completed',
      retrievalMode: 'keyword',
      chunkCount: 1,
    });
    await chunkModel.create({
      documentId,
      documentTitle: 'E2E RAG Acentos',
      documentStatus: 'published',
      documentCategory: 'faq',
      documentVersion: '1.0.0',
      chunkIndex: 0,
      text: 'La emoción, la niñez, la depresión y la acción requieren apoyo claro.',
      retrievalMode: 'keyword',
      embeddingModel: '',
      textLength: 75,
    });

    const response = await request(app.getHttpServer())
      .get(
        '/documents/rag/search?query=emoción%20niñez%20depresión%20acción&limit=3',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = response.body as {
      contextUsed: boolean;
      retrievalMode: string;
      chunks: unknown[];
    };

    expect(body.contextUsed).toBe(true);
    expect(['atlas_vector', 'local_semantic', 'keyword']).toContain(
      body.retrievalMode,
    );
    expect(body.chunks.length).toBeGreaterThan(0);

    const healthResponse = await request(app.getHttpServer())
      .get('/documents/rag/health')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const health = healthResponse.body as {
      configuredRetrievalMode: string;
      effectiveRetrievalMode: string;
      lastRetrievalMode: string;
    };
    expect(health.configuredRetrievalMode).toEqual(expect.any(String));
    expect(health.effectiveRetrievalMode).toBe(body.retrievalMode);
    expect(health.lastRetrievalMode).toBe(body.retrievalMode);
  });

  it('edits a user status from an admin route', async () => {
    const email = `e2e-admin-${Date.now()}@menteamiga.test`;
    const createResponse = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email,
        name: 'E2E Admin User',
        password: 'MenteAmiga.Temp.2026!',
        role: 'user',
        isActive: true,
      })
      .expect(201);
    const created = createResponse.body as { id: string };
    createdUserId = created.id;

    const response = await request(app.getHttpServer())
      .patch(`/users/${createdUserId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false })
      .expect(200);
    const body = response.body as { isActive: boolean };
    expect(body.isActive).toBe(false);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'MenteAmiga.Temp.2026!' })
      .expect(401);
  });

  it('protects premium activation and exposes RAG diagnostic search', async () => {
    await request(app.getHttpServer())
      .post('/admin/subscription-requests/000000000000000000000000/activate')
      .expect(401);
    await request(app.getHttpServer())
      .get(
        '/admin/subscription-requests/000000000000000000000000/proof/download',
      )
      .expect(401);

    const response = await request(app.getHttpServer())
      .get('/documents/rag/search?query=menteamiga&limit=3')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = response.body as {
      contextUsed: boolean;
      retrievalMode: string;
      chunks: unknown[];
    };
    expect(typeof body.contextUsed).toBe('boolean');
    expect(['atlas_vector', 'local_semantic', 'keyword', 'none']).toContain(
      body.retrievalMode,
    );
    expect(Array.isArray(body.chunks)).toBe(true);

    const healthResponse = await request(app.getHttpServer())
      .get('/documents/rag/health')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const health = healthResponse.body as { effectiveRetrievalMode: string };
    expect(['atlas_vector', 'local_semantic', 'keyword', 'none']).toContain(
      health.effectiveRetrievalMode,
    );
  });

  it('activates a premium subscription request end to end', async () => {
    const suffix = Date.now();
    const userEmail = `e2e-premium-${suffix}@menteamiga.test`;
    const userPassword = 'MenteAmiga.Temp.2026!';

    const userResponse = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: userEmail,
        name: 'E2E Premium User',
        password: userPassword,
        role: 'user',
        isActive: true,
      })
      .expect(201);
    const user = userResponse.body as { id: string };

    const planResponse = await request(app.getHttpServer())
      .post('/admin/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `E2E Premium ${suffix}`,
        code: `e2e-premium-${suffix}`,
        category: 'premium',
        price: 19900,
        currency: 'COP',
        durationDays: 30,
        limits: {
          maxChatsPerMonth: 100,
          maxMessagesPerMonth: 1000,
          maxDocumentsMB: 250,
          monthlyTokens: 5000,
          extraTokens: 0,
        },
        isActive: true,
      })
      .expect(201);
    const plan = planResponse.body as {
      _id?: string;
      id?: string;
      code: string;
    };
    const planId = plan._id || plan.id;

    const paymentMethodResponse = await request(app.getHttpServer())
      .post('/admin/payment-methods')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `E2E Nequi ${suffix}`,
        code: `e2e-nequi-${suffix}`,
        provider: 'nequi',
        type: 'wallet',
        accountLabel: 'Numero',
        accountValue: '3000000000',
        holderName: 'MenteAmiga',
        instructions: 'Pago e2e',
        isActive: true,
      })
      .expect(201);
    const paymentMethod = paymentMethodResponse.body as {
      _id?: string;
      id?: string;
    };
    const paymentMethodId = paymentMethod._id || paymentMethod.id;

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: userEmail,
        password: userPassword,
      })
      .expect(201);
    const loginBody = loginResponse.body as { token: string };

    await request(app.getHttpServer())
      .get('/documents')
      .set('Authorization', `Bearer ${loginBody.token}`)
      .expect(403);

    const requestResponse = await request(app.getHttpServer())
      .post('/subscription-requests')
      .set('Authorization', `Bearer ${loginBody.token}`)
      .send({
        planId,
        paymentMethodId,
        requestType: 'premium',
        requestedPlanCode: plan.code,
        payerName: 'E2E Premium User',
        payerPhone: '3000000000',
        reportedAmount: '19900',
        paidAtReference: `E2E-${suffix}`,
        message: 'Solicitud e2e',
      })
      .expect(201);
    const subscriptionRequest = requestResponse.body as {
      _id?: string;
      id?: string;
    };
    const requestId = subscriptionRequest._id || subscriptionRequest.id;

    await request(app.getHttpServer())
      .post(`/admin/subscription-requests/${requestId}/activate`)
      .set('Authorization', `Bearer ${loginBody.token}`)
      .send({ adminNotes: 'Intento usuario e2e' })
      .expect(403);

    const activationResponse = await request(app.getHttpServer())
      .post(`/admin/subscription-requests/${requestId}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ adminNotes: 'Activacion e2e' })
      .expect(201);
    const activation = activationResponse.body as {
      request: { status: string };
      subscription: { userId: string; planCode: string; status: string };
    };

    expect(activation.request.status).toBe('activated');
    expect(activation.subscription.userId).toBe(user.id);
    expect(activation.subscription.planCode).toBe(plan.code);
    expect(activation.subscription.status).toBe('active');
  }, 20000);
});
