import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { conflict, unauthorized } from '../lib/errors';
import { toPublicUser } from './userService';

const BCRYPT_COST = 10;
// Compared against when the username doesn't exist, so response timing doesn't leak which usernames exist.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

export async function register(input: { username: string; displayName: string; password: string }) {
  const existing = await prisma.user.findUnique({ where: { username: input.username } });
  if (existing) throw conflict('username taken');
  const user = await prisma.user.create({
    data: {
      username: input.username,
      displayName: input.displayName,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
    },
  });
  return toPublicUser(user);
}

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('invalid username or password');
  return toPublicUser(user);
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw unauthorized();
  return toPublicUser(user);
}
