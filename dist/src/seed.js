"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('Seeding database...');
    // Create Category
    const category = await prisma.category.create({
        data: {
            name: 'Programming',
            description: 'Test your coding skills',
        }
    });
    // Create Subject
    const subject = await prisma.subject.create({
        data: {
            name: 'Dart & Flutter',
            categoryId: category.id
        }
    });
    // Create Topic
    const topic = await prisma.topic.create({
        data: {
            name: 'Flutter Basics',
            subjectId: subject.id
        }
    });
    // Create Questions
    await prisma.question.create({
        data: {
            text: 'What language is Flutter written in?',
            type: 'MCQ',
            difficulty: 'EASY',
            marks: 10,
            topicId: topic.id,
            subjectId: subject.id,
            options: {
                create: [
                    { text: 'Dart', isCorrect: true },
                    { text: 'Java', isCorrect: false },
                    { text: 'Swift', isCorrect: false },
                    { text: 'Kotlin', isCorrect: false },
                ]
            }
        }
    });
    await prisma.question.create({
        data: {
            text: 'Which widget is used for a scrollable list in Flutter?',
            type: 'MCQ',
            difficulty: 'MEDIUM',
            marks: 10,
            topicId: topic.id,
            subjectId: subject.id,
            options: {
                create: [
                    { text: 'Column', isCorrect: false },
                    { text: 'ListView', isCorrect: true },
                    { text: 'Container', isCorrect: false },
                    { text: 'Stack', isCorrect: false },
                ]
            }
        }
    });
    console.log('Database seeded successfully!');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map