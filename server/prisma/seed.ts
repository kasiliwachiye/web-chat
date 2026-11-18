import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const PASSWORD = 'Password123!';
const people = [
  ['alice', 'Alice Wanjiru'],
  ['bob', 'Bob Otieno'],
  ['carol', 'Carol Mwangi'],
  ['dave', 'Dave Kamau'],
  ['eve', 'Eve Achieng'],
] as const;

async function main() {
  await prisma.message.deleteMany();
  await prisma.conversationMember.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.user.deleteMany();

  const hash = await bcrypt.hash(PASSWORD, 10);
  const users = Object.fromEntries(
    await Promise.all(
      people.map(async ([username, displayName]) => [
        username,
        await prisma.user.create({ data: { username, displayName, passwordHash: hash } }),
      ]),
    ),
  );
  const { alice, bob, carol, dave } = users;

  const t0 = Date.now() - 60 * 60 * 1000;
  let i = 0;
  const at = () => new Date(t0 + i++ * 60_000);

  const group = await prisma.conversation.create({
    data: {
      type: 'GROUP',
      name: 'Project Phoenix',
      createdBy: alice.id,
      members: {
        create: [
          { userId: alice.id, role: 'OWNER' },
          { userId: bob.id, role: 'MEMBER' },
          { userId: carol.id, role: 'MEMBER' },
          { userId: dave.id, role: 'MEMBER' },
        ],
      },
    },
  });
  const groupLines: [typeof alice, string][] = [
    [alice, 'Morning all, kickoff for Phoenix is at 10.'],
    [bob, 'Thanks Alice. Is the agenda in the shared drive?'],
    [alice, 'Yes, under Projects/Phoenix/Kickoff.'],
    [carol, 'I will present the data migration plan.'],
    [dave, 'I can cover the infra and security review.'],
    [bob, 'Great, see you all at 10.'],
  ];
  for (const [u, body] of groupLines) {
    await prisma.message.create({
      data: { conversationId: group.id, senderId: u.id, body, clientMsgId: randomUUID(), createdAt: at() },
    });
  }

  const dm = await prisma.conversation.create({
    data: {
      type: 'DIRECT',
      directKey: [alice.id, bob.id].sort().join(':'),
      createdBy: alice.id,
      members: { create: [{ userId: alice.id, role: 'OWNER' }, { userId: bob.id, role: 'MEMBER' }] },
    },
  });
  const dmLines: [typeof alice, string][] = [
    [alice, 'Hi Bob, do you have a minute to review the Q4 budget?'],
    [bob, 'Sure, send it over.'],
    [alice, 'Sent. Let me know if the numbers look right.'],
  ];
  for (const [u, body] of dmLines) {
    await prisma.message.create({
      data: { conversationId: dm.id, senderId: u.id, body, clientMsgId: randomUUID(), createdAt: at() },
    });
  }

  // Mark history as read for everyone so unread badges start at 0.
  for (const conv of [group, dm]) {
    const last = await prisma.message.findFirst({ where: { conversationId: conv.id }, orderBy: { createdAt: 'desc' } });
    await prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: last!.createdAt } });
    await prisma.conversationMember.updateMany({ where: { conversationId: conv.id }, data: { lastReadMessageId: last!.id } });
  }

  console.log(`Seeded ${people.length} users (password: ${PASSWORD}), 1 group, 1 DM.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
