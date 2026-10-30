/**
 * Seeds realistic demo data. Run with `npm run seed` (uses MONGODB_URI) — WIPES existing data.
 *
 * Deliberately includes cases that show off the queries:
 *  - NLP faculty who published recently AND have open slots  (should appear in the headline search)
 *  - NLP faculty whose last paper was years ago             (filtered out by publishedWithinYears)
 *  - NLP faculty with a full lab                            (filtered out by hasOpenSlots)
 *  - Students with python + genomics, some attached to a lab, some not
 *
 * Demo logins (password: password123):
 *   student@researchmesh.dev   faculty@researchmesh.dev   admin@researchmesh.dev
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { models } from '../models/index.js';

const { Department, User, Lab, Project, Publication, Grant, JoinRequest, Notification } = models;

// Deterministic PRNG so every seed produces the same dataset.
let s = 42;
const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const pickN = (arr, n) => [...arr].sort(() => rand() - 0.5).slice(0, n);
const lvl = () => 2 + Math.floor(rand() * 4); // 2..5

const Y = new Date().getFullYear();

const DEPARTMENTS = [
  { name: 'Computer Science & Engineering', code: 'CSE' },
  { name: 'Master of Computer Applications', code: 'MCA' },
  { name: 'Biotechnology', code: 'BT' },
  { name: 'Electronics & Communication', code: 'ECE' },
  { name: 'Mathematics', code: 'MATH' },
];

// [name, title, dept, interests, skills, pubYears, lab?]
const FACULTY = [
  ['Dr. Ananya Rao', 'Associate Professor', 'CSE', ['nlp', 'large language models', 'information retrieval'], ['python', 'pytorch', 'nlp', 'transformers'], [Y, Y - 1, Y - 1, Y - 3],
    { name: 'Language Intelligence Lab', areas: ['nlp', 'llms', 'retrieval augmented generation'], capacity: 8, open: 3 }],
  ['Dr. Vikram Menon', 'Professor', 'CSE', ['nlp', 'machine translation', 'indic languages'], ['python', 'nlp', 'tensorflow'], [Y - 5, Y - 6, Y - 7, Y - 8],
    { name: 'Indic NLP Group', areas: ['nlp', 'machine translation', 'speech'], capacity: 6, open: 2 }],
  ['Dr. Kavitha Shetty', 'Assistant Professor', 'MCA', ['nlp', 'legal ai', 'document understanding'], ['python', 'nlp', 'spacy', 'langchain'], [Y, Y - 1],
    { name: 'Applied NLP & Documents Lab', areas: ['nlp', 'legal tech', 'document ai'], capacity: 5, open: 0 }],
  ['Dr. Rahul Iyer', 'Professor', 'BT', ['genomics', 'bioinformatics', 'cancer biology'], ['python', 'r', 'genomics', 'bioinformatics'], [Y, Y, Y - 1, Y - 2],
    { name: 'Computational Genomics Lab', areas: ['genomics', 'bioinformatics', 'single-cell'], capacity: 10, open: 4 }],
  ['Dr. Meera Krishnan', 'Associate Professor', 'BT', ['proteomics', 'drug discovery', 'genomics'], ['python', 'molecular docking', 'genomics'], [Y - 1, Y - 2],
    { name: 'Molecular Design Lab', areas: ['drug discovery', 'proteomics', 'structural biology'], capacity: 6, open: 1 }],
  ['Dr. Arjun Nair', 'Assistant Professor', 'CSE', ['computer vision', 'medical imaging', 'deep learning'], ['python', 'pytorch', 'opencv', 'computer vision'], [Y, Y - 1, Y - 1],
    { name: 'Vision & Health Lab', areas: ['computer vision', 'medical imaging'], capacity: 7, open: 2 }],
  ['Dr. Sneha Kulkarni', 'Professor', 'ECE', ['iot', 'edge ai', 'embedded systems'], ['c', 'embedded systems', 'python', 'tinyml'], [Y - 1, Y - 3],
    { name: 'Edge Intelligence Lab', areas: ['iot', 'edge ai', 'tinyml'], capacity: 6, open: 3 }],
  ['Dr. Prakash Hegde', 'Professor', 'MATH', ['graph theory', 'optimization', 'network science'], ['python', 'mathematics', 'optimization'], [Y - 4, Y - 9], null],
  ['Dr. Farah Siddiqui', 'Associate Professor', 'MCA', ['cybersecurity', 'blockchain', 'privacy'], ['python', 'cryptography', 'solidity', 'cybersecurity'], [Y, Y - 2],
    { name: 'Secure Systems Lab', areas: ['cybersecurity', 'blockchain', 'privacy'], capacity: 6, open: 2 }],
  ['Dr. Deepak Joshi', 'Assistant Professor', 'MCA', ['recommender systems', 'nlp', 'data mining'], ['python', 'nlp', 'sql', 'machine learning'], [Y, Y - 1],
    { name: 'Data & Recommendation Lab', areas: ['recommender systems', 'data mining', 'nlp'], capacity: 6, open: 1 }],
  ['Dr. Lakshmi Venkatesh', 'Professor', 'CSE', ['distributed systems', 'cloud computing', 'kubernetes'], ['go', 'kubernetes', 'distributed systems'], [Y - 1, Y - 2, Y - 3],
    { name: 'Cloud Systems Lab', areas: ['distributed systems', 'cloud', 'devops'], capacity: 8, open: 0 }],
];

const FIRST = ['Aditi', 'Rohan', 'Priya', 'Karthik', 'Sneha', 'Arjun', 'Divya', 'Nikhil', 'Pooja', 'Varun', 'Meghana', 'Siddharth', 'Ishita', 'Harsha', 'Tanvi', 'Manoj', 'Shreya', 'Akash', 'Nandini', 'Gautam', 'Bhavana', 'Kiran', 'Ritika', 'Abhishek', 'Swathi', 'Yash', 'Anjali', 'Pranav'];
const LAST = ['Sharma', 'Reddy', 'Patil', 'Gowda', 'Bhat', 'Kumar', 'Naidu', 'Desai', 'Pillai', 'Shenoy', 'Murthy', 'Kamath'];
const PROGRAMS = { CSE: 'M.Tech', MCA: 'MCA', BT: 'M.Sc Biotech', ECE: 'M.Tech', MATH: 'PhD' };

const INTEREST_POOLS = {
  CSE: ['nlp', 'computer vision', 'deep learning', 'distributed systems', 'large language models', 'medical imaging'],
  MCA: ['nlp', 'web development', 'cybersecurity', 'recommender systems', 'data mining', 'legal ai', 'blockchain'],
  BT: ['genomics', 'bioinformatics', 'drug discovery', 'proteomics', 'single-cell'],
  ECE: ['iot', 'edge ai', 'embedded systems', 'signal processing'],
  MATH: ['optimization', 'graph theory', 'network science', 'statistics'],
};
const SKILL_POOLS = {
  CSE: ['python', 'pytorch', 'java', 'c++', 'docker', 'kubernetes', 'opencv', 'nlp', 'transformers'],
  MCA: ['python', 'javascript', 'react', 'node.js', 'mongodb', 'sql', 'nlp', 'machine learning', 'graphql'],
  BT: ['python', 'r', 'genomics', 'bioinformatics', 'biopython', 'statistics', 'wet lab'],
  ECE: ['c', 'python', 'embedded systems', 'matlab', 'tinyml', 'verilog'],
  MATH: ['python', 'mathematics', 'r', 'optimization', 'statistics'],
};

export async function seed({ quiet = true } = {}) {
  const log = (...a) => !quiet && console.log(...a);
  s = 42;

  await Promise.all(Object.values(models).map((m) => m.deleteMany({})));
  await Promise.all(Object.values(models).map((m) => m.syncIndexes()));

  const passwordHash = await bcrypt.hash('password123', 10);

  const depts = await Department.insertMany(DEPARTMENTS);
  const dept = Object.fromEntries(depts.map((d) => [d.code, d]));

  /* ---------------- faculty + labs + publications + grants ---------------- */
  const facultyDocs = [];
  const labDocs = [];
  for (const [i, [name, title, code, interests, skills, pubYears, labDef]] of FACULTY.entries()) {
    const email = i === 0 ? 'faculty@researchmesh.dev' : `${name.replace(/^Dr\.\s*/, '').toLowerCase().replace(/\s+/g, '.')}@researchmesh.dev`;
    const f = await User.create({
      name, title, email, passwordHash, role: 'FACULTY', department: dept[code]._id,
      interests, skills: skills.map((n) => ({ name: n, level: 4 + (rand() > 0.5 ? 1 : 0) })),
      bio: `${title} in ${dept[code].name}. Research focus: ${interests.join(', ')}.`,
      lastActiveAt: new Date(Date.now() - Math.floor(rand() * 30) * 864e5),
    });
    facultyDocs.push(f);

    for (const [k, year] of pubYears.entries()) {
      await Publication.create({
        title: `${interests[k % interests.length].replace(/\b\w/g, (c) => c.toUpperCase())}: ${['A Survey', 'New Methods', 'Benchmarks and Baselines', 'Scaling Laws', 'An Empirical Study', 'Towards Robustness'][k % 6]}`,
        venue: ['ACL', 'EMNLP', 'NeurIPS', 'Bioinformatics', 'IEEE Access', 'Nature Comms', 'ICASSP', 'CVPR'][(i + k) % 8],
        year,
        authors: [f._id],
        externalAuthors: ['A. Collaborator'],
        keywords: pickN(interests, 2),
      });
    }

    if (labDef) {
      const lab = await Lab.create({
        name: labDef.name, description: `Research group led by ${name}.`, department: dept[code]._id,
        head: f._id, members: [], researchAreas: labDef.areas, capacity: labDef.capacity, openSlots: labDef.open,
      });
      f.lab = lab._id;
      await f.save();
      labDocs.push(lab);
      if (rand() > 0.3) {
        await Grant.create({
          title: `${labDef.areas[0]} research programme`, agency: ['DST-SERB', 'DBT', 'AICTE', 'MeitY', 'ICMR'][i % 5],
          amount: Math.round((10 + rand() * 90)) * 100000, startDate: new Date(Y - 1, 3, 1), endDate: new Date(Y + 2, 2, 31),
          lab: lab._id, principalInvestigator: f._id,
        });
      }
    }
  }

  /* --------------------------------- students -------------------------------- */
  const students = [];
  const codes = Object.keys(dept);
  for (let i = 0; i < 28; i++) {
    const code = i === 0 ? 'MCA' : codes[i % codes.length];
    const name = i === 0 ? 'Siri Demo' : `${FIRST[i]} ${LAST[i % LAST.length]}`;
    const email = i === 0 ? 'student@researchmesh.dev' : `${FIRST[i].toLowerCase()}.${LAST[i % LAST.length].toLowerCase()}${i}@researchmesh.dev`;
    let skills = pickN(SKILL_POOLS[code], 3 + Math.floor(rand() * 3)).map((n) => ({ name: n, level: lvl() }));
    let interests = pickN(INTEREST_POOLS[code], 2 + Math.floor(rand() * 2));
    // Guarantee some python + genomics students exist (half of BT students, plus one CSE crossover).
    if ((code === 'BT' && i % 2 === 0) || i === 5) {
      skills = [...skills.filter((x) => !['python', 'genomics'].includes(x.name)), { name: 'python', level: 4 }, { name: 'genomics', level: 3 }];
      interests = [...new Set([...interests, 'genomics'])];
    }
    if (i === 0) {
      skills = [{ name: 'python', level: 4 }, { name: 'javascript', level: 4 }, { name: 'react', level: 4 }, { name: 'nlp', level: 3 }, { name: 'graphql', level: 3 }, { name: 'mongodb', level: 3 }];
      interests = ['nlp', 'large language models', 'legal ai'];
    }
    students.push(await User.create({
      name, email, passwordHash, role: 'STUDENT', department: dept[code]._id, program: PROGRAMS[code],
      yearOfStudy: 1 + (i % 2), skills, interests, lookingFor: pickN(['MENTOR', 'LAB', 'COLLABORATOR', 'PROJECT'], 2),
      bio: `${PROGRAMS[code]} student interested in ${interests.join(', ')}.`,
      lastActiveAt: new Date(Date.now() - Math.floor(rand() * 14) * 864e5),
    }));
  }

  // Attach some students to labs in their own department (not the demo student, not every genomics student).
  for (const [i, st] of students.entries()) {
    if (i === 0 || i % 3 !== 0) continue;
    const lab = labDocs.find((l) => String(l.department) === String(st.department) && l.members.length < l.capacity - l.openSlots);
    if (!lab) continue;
    lab.members.push(st._id);
    await lab.save();
    st.lab = lab._id;
    await st.save();
  }

  // Connections
  for (const st of students) {
    const others = pickN(students.filter((o) => o !== st), 3);
    st.connections = [...new Set([...(st.connections || []).map(String), ...others.map((o) => String(o._id))])];
    await st.save();
  }

  /* --------------------------------- projects -------------------------------- */
  const projectDefs = [
    [0, 'Legal-clause RAG assistant', ['python', 'nlp', 'langchain'], ['nlp', 'legal ai', 'rag'], 'ACTIVE'],
    [0, 'Kannada–English code-mixed sentiment', ['python', 'nlp', 'transformers'], ['nlp', 'indic languages'], 'PLANNING'],
    [3, 'Single-cell atlas of oral cancer', ['python', 'genomics', 'r'], ['genomics', 'single-cell', 'cancer biology'], 'ACTIVE'],
    [3, 'Variant calling pipeline benchmark', ['python', 'bioinformatics', 'docker'], ['genomics', 'bioinformatics'], 'PLANNING'],
    [5, 'Chest X-ray triage with explainability', ['python', 'pytorch', 'computer vision'], ['medical imaging', 'deep learning'], 'ACTIVE'],
    [6, 'TinyML crop-disease detector', ['c', 'tinyml', 'python'], ['edge ai', 'iot'], 'ACTIVE'],
    [8, 'Phishing URL detection with graph features', ['python', 'machine learning', 'cybersecurity'], ['cybersecurity', 'privacy'], 'PLANNING'],
    [9, 'Course recommender for electives', ['python', 'sql', 'machine learning'], ['recommender systems', 'data mining'], 'ACTIVE'],
  ];
  for (const [fi, title, requiredSkills, tags, status] of projectDefs) {
    const f = facultyDocs[fi];
    const labMembers = f.lab ? (labDocs.find((l) => String(l._id) === String(f.lab))?.members ?? []) : [];
    await Project.create({
      title, description: `${title}. Looking for motivated students.`, owner: f._id, lab: f.lab,
      members: [f._id, ...labMembers.slice(0, 1)], requiredSkills, tags, status, isOpen: true, maxMembers: 5,
    });
  }
  // A student-owned project
  await Project.create({
    title: 'Campus research-collab Discord bot', description: 'Bot that pings people when matching projects open.',
    owner: students[0]._id, members: [students[0]._id], requiredSkills: ['javascript', 'node.js', 'graphql'],
    tags: ['web development', 'nlp'], status: 'PLANNING', isOpen: true, maxMembers: 4,
  });

  /* ------------------------- admin + a sample join request ------------------------ */
  await User.create({ name: 'Platform Admin', email: 'admin@researchmesh.dev', passwordHash, role: 'ADMIN', department: dept.CSE._id });

  const genomicsStudent = students.find((st) => !st.lab && st.skills.some((k) => k.name === 'genomics'));
  const genomicsLab = labDocs.find((l) => l.name === 'Computational Genomics Lab');
  if (genomicsStudent && genomicsLab) {
    const jr = await JoinRequest.create({
      requester: genomicsStudent._id, recipient: genomicsLab.head, targetType: 'LAB', lab: genomicsLab._id,
      message: 'I have worked on RNA-seq pipelines in Python and would love to join.',
    });
    await Notification.create({
      recipient: genomicsLab.head, type: 'JOIN_REQUEST', message: `${genomicsStudent.name} requested to join your lab "${genomicsLab.name}"`,
      actor: genomicsStudent._id, lab: genomicsLab._id, joinRequest: jr._id,
    });
  }

  const counts = Object.fromEntries(await Promise.all(Object.entries(models).map(async ([k, m]) => [k, await m.countDocuments()])));
  log('🌱 Seeded:', counts);
  log('   Logins (password123): student@researchmesh.dev | faculty@researchmesh.dev | admin@researchmesh.dev');
  return counts;
}

// Run directly: `node src/seed/seed.js`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/researchmesh';
  await mongoose.connect(uri);
  await seed({ quiet: false });
  await mongoose.disconnect();
}
