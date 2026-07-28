"use strict";
// Bangladeshi exam category -> subject -> suggested topics taxonomy.
// Used by demoController to validate/sanitize incoming selections and by
// the landing page to render the category/subject/topic pickers, so the
// two stay in sync (the frontend copy is generated from this via a script
// step is unnecessary for a static page - it's hand-mirrored, see
// landing-page.html's DEMO_TAXONOMY constant).
Object.defineProperty(exports, "__esModule", { value: true });
exports.demoTaxonomy = void 0;
exports.sanitizeFreeText = sanitizeFreeText;
exports.resolveCategory = resolveCategory;
exports.demoTaxonomy = {
    cse: {
        label: 'CSE (Computer Science)',
        labelBn: 'সিএসই (কম্পিউটার সায়েন্স)',
        subjects: {
            'Data Structures': ['Arrays', 'Linked List', 'Stack & Queue', 'Trees', 'Graphs', 'Sorting Algorithms'],
            'Algorithms': ['Time Complexity', 'Recursion', 'Dynamic Programming', 'Greedy Algorithms', 'Divide and Conquer'],
            'Operating Systems': ['Process Management', 'Memory Management', 'Deadlock', 'CPU Scheduling', 'File Systems'],
            'DBMS': ['SQL Basics', 'Normalization', 'Transactions', 'Indexing', 'ER Diagrams'],
            'Computer Networks': ['OSI Model', 'TCP/IP', 'Routing', 'Network Security'],
            'OOP': ['Classes & Objects', 'Inheritance', 'Polymorphism', 'Encapsulation'],
        },
    },
    bcs: {
        label: 'BCS Preparation',
        labelBn: 'বিসিএস প্রস্তুতি',
        subjects: {
            'Bangla': ['ব্যাকরণ', 'সাহিত্য', 'নির্মিতি'],
            'English': ['Grammar', 'Vocabulary', 'Comprehension'],
            'Bangladesh Affairs': ['History', 'Geography', 'Constitution', 'Liberation War'],
            'International Affairs': ['World Organizations', 'Global Events', 'Countries & Capitals'],
            'General Science': ['Physics Basics', 'Chemistry Basics', 'Biology Basics'],
            'Math & Mental Ability': ['Arithmetic', 'Algebra', 'Reasoning'],
            'Computer & ICT': ['Basics of Computer', 'Internet', 'Cyber Security'],
            'Ethics & Values': ['Good Governance', 'Values and Ethics'],
        },
    },
    hsc: {
        label: 'HSC',
        labelBn: 'এইচএসসি',
        subjects: {
            'Physics': ['Vector', 'Motion', 'Work Energy Power', 'Electricity', 'Waves'],
            'Chemistry': ['Organic Chemistry', 'Periodic Table', 'Chemical Bonding', 'Equilibrium'],
            'Biology': ['Cell Biology', 'Genetics', 'Human Physiology', 'Plant Physiology'],
            'Higher Math': ['Matrices', 'Calculus', 'Trigonometry', 'Vectors'],
            'ICT': ['Number System', 'Programming Basics', 'Database', 'Web Design'],
        },
    },
    ssc: {
        label: 'SSC',
        labelBn: 'এসএসসি',
        subjects: {
            'Physics': ['Force and Motion', 'Light', 'Electricity'],
            'Chemistry': ['Matter', 'Chemical Reactions', 'Acid Base Salt'],
            'Biology': ['Cell', 'Reproduction', 'Ecosystem'],
            'Math': ['Algebra', 'Geometry', 'Trigonometry'],
            'General Science': ['Physics Basics', 'Chemistry Basics', 'Biology Basics'],
        },
    },
    admission: {
        label: 'Admission Test',
        labelBn: 'ভর্তি পরীক্ষা',
        subjects: {
            'Physics': ['Mechanics', 'Electricity', 'Modern Physics'],
            'Chemistry': ['Organic', 'Inorganic', 'Physical Chemistry'],
            'Math': ['Algebra', 'Geometry', 'Calculus'],
            'English': ['Grammar', 'Vocabulary', 'Comprehension'],
            'General Knowledge': ['Current Affairs', 'Bangladesh', 'World'],
        },
    },
};
/** Strip anything but letters (incl. Bangla), digits, spaces and basic punctuation; cap length. */
function sanitizeFreeText(input, maxLen) {
    const cleaned = (input || '')
        .replace(/[^\p{L}\p{N}\s.,&()-]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned.slice(0, maxLen);
}
function resolveCategory(categoryKey) {
    return exports.demoTaxonomy[categoryKey] || null;
}
//# sourceMappingURL=demoTaxonomy.js.map