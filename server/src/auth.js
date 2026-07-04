import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { prisma } from './db.js';

const SECRET = process.env.JWT_SECRET || 'docgen-dev-secret';

export function sign(userId) {
  return jwt.sign({ uid: userId }, SECRET, { expiresIn: '7d' });
}

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  try {
    req.uid = jwt.verify(token, SECRET).uid;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

async function bootstrapUser(user) {
  await prisma.automation.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id }
  });
  const owner = await prisma.teamMember.findFirst({ where: { ownerId: user.id, role: 'Owner' } });
  if (!owner) {
    await prisma.teamMember.create({
      data: { ownerId: user.id, name: user.name || user.email.split('@')[0], email: user.email, role: 'Owner' }
    });
  }
}

function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, oauthProvider: u.oauthProvider,
    plan: u.plan, billingCycle: u.billingCycle, seats: u.seats
  };
}

export const authRouter = Router();

// POST /api/auth/signup  { email, password? , provider? , name? }
// provider = mock OAuth (github|gitlab|bitbucket); doubles as source authorization.
authRouter.post('/signup', async (req, res) => {
  const { email, password, provider, name } = req.body || {};
  const providerEmail = provider ? 'praveen@acme.dev' : null;
  const finalEmail = String(email || providerEmail || '').trim().toLowerCase();
  if (!finalEmail || !finalEmail.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
  if (!provider && (!password || String(password).length < 8)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  let user = await prisma.user.findUnique({ where: { email: finalEmail } });
  if (user && !provider) return res.status(409).json({ error: 'An account with this email already exists — log in instead' });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: finalEmail,
        name: name || '',
        oauthProvider: provider || null,
        passwordHash: provider ? null : await bcrypt.hash(String(password), 10)
      }
    });
  }
  if (provider) {
    const existing = await prisma.source.findFirst({ where: { userId: user.id, provider } });
    if (!existing) {
      await prisma.source.create({ data: { userId: user.id, provider, detail: 'OAuth read-only (contents + commit history)' } });
    }
  }
  await bootstrapUser(user);
  res.json({ token: sign(user.id), user: publicUser(user) });
});

// POST /api/auth/login  { email, password }  (or { provider } for mock OAuth login)
authRouter.post('/login', async (req, res) => {
  const { email, password, provider } = req.body || {};
  if (provider) {
    let user = await prisma.user.findFirst({ where: { oauthProvider: provider } });
    if (!user) {
      user = await prisma.user.create({ data: { email: 'praveen@acme.dev', oauthProvider: provider } });
      await bootstrapUser(user);
    }
    return res.json({ token: sign(user.id), user: publicUser(user) });
  }
  const finalEmail = String(email || '').trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: finalEmail } });
  if (!user || !user.passwordHash || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  await bootstrapUser(user);
  res.json({ token: sign(user.id), user: publicUser(user) });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.uid } });
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ user: publicUser(u) });
});
