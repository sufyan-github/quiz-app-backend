import { Role } from '@prisma/client';
import { prisma } from './index';
import bcrypt from 'bcrypt';

async function main() {
  console.log('Seeding database...');

  // 1. Create Default AI Prompt Templates
  const tutorTemplate = await prisma.aiPromptTemplate.upsert({
    where: { name: 'TUTOR_DEFAULT' },
    update: {},
    create: {
      name: 'TUTOR_DEFAULT',
      description: 'Default prompt for the AI Tutor',
      systemPrompt: 'You are an expert, encouraging AI tutor. Explain concepts simply with analogies and code examples if relevant.',
      model: 'gpt-4o',
      isActive: true
    }
  });
  console.log('Created AI Prompt Template:', tutorTemplate.name);

  // 2. Create Super Admin Account
  const adminEmail = 'admin@quizmaster.com';
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
      subscription_status: 'REGISTERED',
      profile: {
        create: {
          name: 'Super Admin'
        }
      }
    }
  });
  console.log('Created Admin User:', admin.email);

  // 3. Create Default Category, Subject, and Topic for testing
  const category = await prisma.category.create({
    data: {
      name: 'Technology',
      description: 'Computer science and programming concepts',
      subjects: {
        create: {
          name: 'Software Engineering',
          topics: {
            create: [
              { name: 'JavaScript Basics' },
              { name: 'Node.js & Backend' },
              { name: 'Databases & SQL' }
            ]
          }
        }
      }
    }
  });
  console.log('Created Demo Category, Subject, and Topics.');

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
