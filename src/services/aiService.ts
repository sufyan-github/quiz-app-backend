import { openai } from '../config/openai';
import { prisma } from '../prisma';

export const aiService = {
  async askTutor(prompt: string, userId: string, topicId?: string, lessonId?: string) {
    const template = await prisma.aiPromptTemplate.findUnique({
      where: { name: 'TUTOR_DEFAULT' }
    });

    const systemPrompt = template?.systemPrompt || 
      "You are an expert, encouraging AI tutor. Explain concepts simply with analogies and code examples if relevant.";

    const response = await openai.chat.completions.create({
      model: template?.model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
    });

    const answer = response.choices[0].message.content || '';

    await prisma.aiConversation.create({
      data: {
        userId,
        topic: topicId || 'General',
        context: lessonId || 'None',
        messages: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: answer }
        ]
      }
    });

    return answer;
  },

  async generateHint(questionId: string, userId: string) {
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: { options: true }
    });

    if (!question) {
      throw new Error('Question not found');
    }

    const prompt = `Generate a short, helpful hint for this question without giving away the direct answer.
    Question: ${question.text}
    Options: ${question.options.map(o => o.text).join(', ')}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: "You are a helpful tutor. Give a tiny hint that nudges the student in the right direction without revealing the exact answer." },
        { role: 'user', content: prompt }
      ],
    });

    const hint = response.choices[0].message.content || '';

    await prisma.aiFeedback.create({
      data: {
        userId,
        targetType: 'QUESTION',
        targetId: questionId,
        feedback: hint,
      }
    });

    return hint;
  },

  async generateQuiz(topicId: string, adminId: string, difficulty?: string, count?: number, adminPrompt?: string, language?: string) {
    const topic = await prisma.topic.findUnique({ 
      where: { id: topicId },
      include: {
        subject: {
          include: {
            category: true
          }
        }
      }
    });

    if (!topic) {
      throw new Error('Topic not found');
    }

    const subjectName = topic.subject?.name || 'General';
    const categoryName = topic.subject?.category?.name || 'General';
    const targetLanguage = language || 'english';

    let prompt = `Generate ${count || 5} multiple choice questions about the topic "${topic.name}" under the subject "${subjectName}" and category "${categoryName}" at a ${difficulty || 'MEDIUM'} difficulty.
    Make sure the context is strictly relevant to the subject "${subjectName}" (e.g. if the subject is "Bangladesh Affairs" or "Bangladesh", questions must strictly focus on Bangladesh context rather than general global context).
    
    Language Requirement: The entire generated content (the question "text", the choice "text"s inside "options", and the "explanation") MUST be written strictly in the ${targetLanguage} language. E.g., if language is "bangla", write everything in Bangla (Bengali script).
    
    Return the output as a raw JSON array of objects.
    Each object must have exactly this structure:
    {
      "text": "The question string",
      "explanation": "Why the correct answer is correct",
      "options": [
        { "text": "option 1", "isCorrect": true },
        { "text": "option 2", "isCorrect": false },
        { "text": "option 3", "isCorrect": false },
        { "text": "option 4", "isCorrect": false }
      ]
    }`;

    if (adminPrompt && adminPrompt.trim().length > 0) {
      prompt += `\n\nExtra guidelines/directives provided by administrator: ${adminPrompt}`;
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: "You are a JSON quiz generator API. Output ONLY raw JSON, no markdown formatting." },
        { role: 'user', content: prompt }
      ],
    });

    let jsonString = response.choices[0].message.content || '[]';
    jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();

    const questionsPayload = JSON.parse(jsonString);

    const generated = await prisma.aiGeneratedQuestion.create({
      data: {
        topicId: topic.id,
        generatedBy: adminId,
        content: questionsPayload,
        status: 'PENDING'
      }
    });

    return generated;
  }
};
