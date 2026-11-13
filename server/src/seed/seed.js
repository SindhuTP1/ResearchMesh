/**
 * Seeds the university directory: departments, faculty, labs, publications, grants, students and projects.
 * Run with `npm run seed` (uses MONGODB_URI) — WIPES existing data.
 *
 * Seeded people are directory records only: each gets a random, never-revealed password, so nobody can log
 * in as them. Real users create their own accounts (student / faculty / admin) from the sign-up page.
 *
 * Deliberately includes cases that exercise the search:
 *  - NLP faculty who published recently AND have open slots  (appear in "nlp, last 2 years, open slot")
 *  - NLP faculty whose last paper was years ago             (filtered out by publishedWithinYears)
 *  - NLP faculty with a full lab                            (filtered out by hasOpenSlots)
 *  - Students with python + genomics, some attached to a lab, some not
 *  - Faculty sign-ups still waiting for admin verification
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { models } from '../models/index.js';

const { Department, User, Lab, Project, Publication, Grant, JoinRequest, Notification } = models;

// Deterministic PRNG so every seed produces the same dataset.
let s = 42;
const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const pickN = (arr, n) => [...arr].sort(() => rand() - 0.5).slice(0, n);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const lvl = () => 2 + Math.floor(rand() * 4); // 2..5

const Y = new Date().getFullYear();
const DOMAIN = 'univ.edu';

const DEPARTMENTS = [
  { name: 'Computer Science & Engineering', code: 'CSE' },
  { name: 'Information Technology', code: 'IT' },
  { name: 'Master of Computer Applications', code: 'MCA' },
  { name: 'Electronics & Communication', code: 'ECE' },
  { name: 'Electrical & Electronics', code: 'EEE' },
  { name: 'Mechanical & Automation', code: 'MECH' },
  { name: 'Chemistry', code: 'CHEM' },
  { name: 'Biotechnology', code: 'BT' },
  { name: 'Physics', code: 'PHY' },
  { name: 'Mathematics', code: 'MATH' },
];

// [name, title, dept, interests, skills, pubYears, lab?, verification?]
const FACULTY = [
  /* ------------------------------- CSE ------------------------------- */
  ['Dr. Ananya Rao', 'Associate Professor', 'CSE', ['nlp', 'large language models', 'information retrieval'], ['python', 'pytorch', 'nlp', 'transformers'], [Y, Y - 1, Y - 1, Y - 3],
    { name: 'Language Intelligence Lab', areas: ['nlp', 'llms', 'retrieval augmented generation'], capacity: 8, open: 3 }],
  ['Dr. Vikram Menon', 'Professor', 'CSE', ['nlp', 'machine translation', 'indic languages'], ['python', 'nlp', 'tensorflow'], [Y - 5, Y - 6, Y - 7, Y - 8],
    { name: 'Indic NLP Group', areas: ['nlp', 'machine translation', 'speech'], capacity: 6, open: 2 }],
  ['Dr. Arjun Nair', 'Assistant Professor', 'CSE', ['computer vision', 'medical imaging', 'deep learning'], ['python', 'pytorch', 'opencv', 'computer vision'], [Y, Y - 1, Y - 1],
    { name: 'Vision & Health Lab', areas: ['computer vision', 'medical imaging'], capacity: 7, open: 2 }],
  ['Dr. Lakshmi Venkatesh', 'Professor', 'CSE', ['distributed systems', 'cloud computing', 'kubernetes'], ['go', 'kubernetes', 'distributed systems', 'docker'], [Y - 1, Y - 2, Y - 3],
    { name: 'Cloud Systems Lab', areas: ['distributed systems', 'cloud computing', 'devops'], capacity: 8, open: 0 }],
  ['Dr. Sanjay Gupta', 'Professor & Head', 'CSE', ['compilers', 'programming languages', 'java virtual machine'], ['java', 'c++', 'llvm', 'compilers'], [Y - 1, Y - 3, Y - 4],
    { name: 'Programming Systems Lab', areas: ['compilers', 'programming languages', 'jvm'], capacity: 6, open: 1 }],
  ['Dr. Neha Bansal', 'Assistant Professor', 'CSE', ['reinforcement learning', 'robotics', 'deep learning'], ['python', 'pytorch', 'ros', 'reinforcement learning'], [Y, Y, Y - 1],
    { name: 'Learning & Autonomy Lab', areas: ['reinforcement learning', 'robotics', 'autonomous systems'], capacity: 7, open: 3 }],
  ['Dr. Mohan Raj', 'Associate Professor', 'CSE', ['quantum computing', 'algorithms', 'post-quantum cryptography'], ['python', 'qiskit', 'mathematics', 'c++'], [Y, Y - 2],
    { name: 'Quantum Algorithms Group', areas: ['quantum computing', 'post-quantum cryptography'], capacity: 5, open: 2 }],
  ['Dr. Shalini Verma', 'Assistant Professor', 'CSE', ['ar/vr', 'computer graphics', 'human computer interaction'], ['unity', 'c#', 'c++', 'opengl'], [Y - 1], null],
  ['Dr. Rohan Mehta', 'Visiting Faculty', 'CSE', ['data engineering', 'big data', 'stream processing'], ['java', 'scala', 'spark', 'kafka'], [], null, 'PENDING'],

  /* -------------------------------- IT -------------------------------- */
  ['Dr. Suresh Babu', 'Professor', 'IT', ['cloud computing', 'serverless', 'multi-cloud'], ['aws', 'azure', 'terraform', 'kubernetes', 'python'], [Y, Y - 1, Y - 1, Y - 2],
    { name: 'Cloud Native Computing Lab', areas: ['cloud computing', 'serverless', 'cloud native'], capacity: 8, open: 3 }],
  ['Dr. Nisha Agarwal', 'Associate Professor', 'IT', ['devops', 'ci/cd', 'site reliability engineering'], ['jenkins', 'docker', 'kubernetes', 'ansible', 'github actions', 'prometheus'], [Y, Y - 1],
    { name: 'DevOps & Reliability Lab', areas: ['devops', 'ci/cd', 'site reliability engineering', 'observability'], capacity: 6, open: 2 }],
  ['Dr. Rajesh Khanna', 'Professor', 'IT', ['java', 'spring boot', 'microservices', 'enterprise software'], ['java', 'spring boot', 'hibernate', 'kafka', 'microservices', 'sql'], [Y - 1, Y - 2, Y - 3],
    { name: 'Enterprise Software Engineering Lab', areas: ['microservices', 'spring boot', 'java', 'event-driven architecture'], capacity: 8, open: 4 }],
  ['Dr. Pooja Malhotra', 'Assistant Professor', 'IT', ['test automation', 'software testing', 'quality engineering'], ['selenium', 'java', 'cypress', 'playwright', 'testng', 'python'], [Y, Y],
    { name: 'Software Quality & Automation Lab', areas: ['test automation', 'software testing', 'devops'], capacity: 5, open: 2 }],
  ['Dr. Imran Qureshi', 'Associate Professor', 'IT', ['cloud security', 'zero trust', 'devsecops'], ['aws', 'kubernetes', 'cybersecurity', 'terraform', 'python'], [Y, Y - 2], null],
  ['Dr. Harini Subramanian', 'Assistant Professor', 'IT', ['mlops', 'data engineering', 'cloud computing'], ['python', 'spark', 'airflow', 'docker', 'aws', 'mlflow'], [Y, Y - 1],
    { name: 'Data Platforms Lab', areas: ['mlops', 'data engineering', 'big data'], capacity: 6, open: 3 }],
  ['Dr. Karan Sethi', 'Adjunct Professor', 'IT', ['robotic process automation', 'business process automation', 'low-code platforms'], ['uipath', 'python', 'java', 'power automate'], [Y - 1], null],

  /* -------------------------------- MCA ------------------------------- */
  ['Dr. Kavitha Shetty', 'Assistant Professor', 'MCA', ['nlp', 'legal ai', 'document understanding'], ['python', 'nlp', 'spacy', 'langchain'], [Y, Y - 1],
    { name: 'Applied NLP & Documents Lab', areas: ['nlp', 'legal tech', 'document ai'], capacity: 5, open: 0 }],
  ['Dr. Farah Siddiqui', 'Associate Professor', 'MCA', ['cybersecurity', 'blockchain', 'privacy'], ['python', 'cryptography', 'solidity', 'cybersecurity'], [Y, Y - 2],
    { name: 'Secure Systems Lab', areas: ['cybersecurity', 'blockchain', 'privacy'], capacity: 6, open: 2 }],
  ['Dr. Deepak Joshi', 'Assistant Professor', 'MCA', ['recommender systems', 'nlp', 'data mining'], ['python', 'nlp', 'sql', 'machine learning'], [Y, Y - 1],
    { name: 'Data & Recommendation Lab', areas: ['recommender systems', 'data mining', 'nlp'], capacity: 6, open: 1 }],
  ['Dr. Anil Deshpande', 'Associate Professor', 'MCA', ['full stack development', 'spring boot', 'web engineering'], ['java', 'spring boot', 'react', 'mysql', 'rest apis'], [Y - 1, Y - 2],
    { name: 'Web & Enterprise Apps Lab', areas: ['web development', 'spring boot', 'full stack development'], capacity: 6, open: 2 }],
  ['Dr. Rekha Nambiar', 'Assistant Professor', 'MCA', ['mobile computing', 'android', 'human computer interaction'], ['kotlin', 'java', 'android', 'flutter', 'figma'], [Y, Y - 1], null],

  /* -------------------------------- ECE ------------------------------- */
  ['Dr. Sneha Kulkarni', 'Professor', 'ECE', ['iot', 'edge ai', 'embedded systems'], ['c', 'embedded systems', 'python', 'tinyml'], [Y - 1, Y - 3],
    { name: 'Edge Intelligence Lab', areas: ['iot', 'edge ai', 'tinyml'], capacity: 6, open: 3 }],
  ['Dr. Gopal Krishna', 'Associate Professor', 'ECE', ['vlsi design', 'fpga', 'hardware security'], ['verilog', 'vhdl', 'fpga', 'cadence'], [Y, Y - 1, Y - 2],
    { name: 'VLSI & Hardware Security Lab', areas: ['vlsi design', 'fpga', 'hardware security'], capacity: 6, open: 2 }],
  ['Dr. Revathi Sundaram', 'Professor', 'ECE', ['5g networks', 'wireless communication', 'signal processing'], ['matlab', 'python', 'signal processing', 'gnu radio'], [Y - 1, Y - 2],
    { name: 'Wireless Systems Lab', areas: ['5g networks', 'wireless communication', 'signal processing'], capacity: 8, open: 0 }],

  /* -------------------------------- EEE ------------------------------- */
  ['Dr. Venkatesh Prasad', 'Professor', 'EEE', ['power electronics', 'electric vehicles', 'battery management systems'], ['matlab', 'simulink', 'power electronics', 'embedded c'], [Y, Y - 1, Y - 1],
    { name: 'EV & Power Electronics Lab', areas: ['electric vehicles', 'power electronics', 'battery management systems'], capacity: 8, open: 3 }],
  ['Dr. Kalpana Reddy', 'Associate Professor', 'EEE', ['renewable energy', 'smart grid', 'energy storage'], ['matlab', 'python', 'simulink', 'power systems'], [Y, Y - 2],
    { name: 'Smart Grid Lab', areas: ['smart grid', 'renewable energy', 'energy storage'], capacity: 6, open: 2 }],
  ['Dr. Ashok Pillai', 'Assistant Professor', 'EEE', ['industrial automation', 'plc', 'scada'], ['plc programming', 'scada', 'labview', 'ladder logic', 'python'], [Y, Y - 1],
    { name: 'Industrial Automation & Control Lab', areas: ['industrial automation', 'plc', 'scada', 'industry 4.0'], capacity: 6, open: 3 }],

  /* ------------------------------- MECH ------------------------------- */
  ['Dr. Ramesh Chandra', 'Professor & Head', 'MECH', ['robotics', 'industrial automation', 'mechatronics'], ['ros', 'python', 'c++', 'solidworks', 'plc programming'], [Y, Y, Y - 1, Y - 2],
    { name: 'Robotics & Automation Lab', areas: ['robotics', 'industrial automation', 'mechatronics'], capacity: 10, open: 4 }],
  ['Dr. Swati Kulkarni', 'Associate Professor', 'MECH', ['additive manufacturing', 'digital twins', 'industry 4.0'], ['ansys', 'solidworks', 'python', 'matlab'], [Y - 1, Y - 2],
    { name: 'Smart Manufacturing Lab', areas: ['additive manufacturing', 'digital twins', 'industry 4.0'], capacity: 6, open: 2 }],
  ['Dr. Naveen Hegde', 'Assistant Professor', 'MECH', ['computational fluid dynamics', 'thermal engineering'], ['ansys fluent', 'openfoam', 'matlab', 'python'], [Y - 3, Y - 5], null],

  /* ------------------------------- CHEM ------------------------------- */
  ['Dr. Priya Raghavan', 'Professor', 'CHEM', ['organic chemistry', 'green chemistry', 'catalysis'], ['organic synthesis', 'nmr spectroscopy', 'hplc', 'chemdraw'], [Y, Y, Y - 1, Y - 2],
    { name: 'Green Synthesis Lab', areas: ['green chemistry', 'catalysis', 'organic synthesis'], capacity: 8, open: 3 }],
  ['Dr. Arvind Saxena', 'Associate Professor', 'CHEM', ['computational chemistry', 'molecular modelling', 'cheminformatics'], ['python', 'gaussian', 'rdkit', 'molecular dynamics', 'quantum chemistry'], [Y, Y - 1],
    { name: 'Computational Chemistry Lab', areas: ['computational chemistry', 'cheminformatics', 'molecular modelling'], capacity: 6, open: 2 }],
  ['Dr. Fatima Sheikh', 'Assistant Professor', 'CHEM', ['materials chemistry', 'electrochemistry', 'battery materials'], ['electrochemistry', 'x-ray diffraction', 'sem', 'materials synthesis'], [Y, Y - 1, Y - 1],
    { name: 'Energy Materials Lab', areas: ['battery materials', 'electrochemistry', 'materials chemistry'], capacity: 6, open: 1 }],
  ['Dr. Mahesh Iyengar', 'Professor', 'CHEM', ['analytical chemistry', 'environmental chemistry', 'spectroscopy'], ['hplc', 'gc-ms', 'spectroscopy', 'r'], [Y - 2, Y - 4, Y - 6],
    { name: 'Environmental Analysis Lab', areas: ['analytical chemistry', 'environmental chemistry'], capacity: 6, open: 0 }],
  ['Dr. Lavanya Menon', 'Assistant Professor', 'CHEM', ['polymer chemistry', 'biomaterials', 'drug delivery'], ['polymer synthesis', 'ftir', 'dsc', 'organic synthesis'], [Y, Y - 1], null],
  ['Dr. Meenakshi Iyer', 'Visiting Faculty', 'CHEM', ['medicinal chemistry', 'drug discovery'], ['organic synthesis', 'chemdraw', 'molecular docking'], [], null, 'PENDING'],

  /* -------------------------------- BT -------------------------------- */
  ['Dr. Rahul Iyer', 'Professor', 'BT', ['genomics', 'bioinformatics', 'cancer biology'], ['python', 'r', 'genomics', 'bioinformatics'], [Y, Y, Y - 1, Y - 2],
    { name: 'Computational Genomics Lab', areas: ['genomics', 'bioinformatics', 'single-cell'], capacity: 10, open: 4 }],
  ['Dr. Meera Krishnan', 'Associate Professor', 'BT', ['proteomics', 'drug discovery', 'genomics'], ['python', 'molecular docking', 'genomics'], [Y - 1, Y - 2],
    { name: 'Molecular Design Lab', areas: ['drug discovery', 'proteomics', 'structural biology'], capacity: 6, open: 1 }],
  ['Dr. Shweta Patil', 'Assistant Professor', 'BT', ['synthetic biology', 'crispr', 'metabolic engineering'], ['wet lab', 'crispr', 'python', 'bioinformatics'], [Y, Y],
    { name: 'Synthetic Biology Lab', areas: ['synthetic biology', 'crispr', 'metabolic engineering'], capacity: 6, open: 2 }],

  /* -------------------------------- PHY ------------------------------- */
  ['Dr. Kiran Bhat', 'Professor', 'PHY', ['condensed matter physics', 'superconductivity', 'quantum materials'], ['python', 'matlab', 'dft', 'x-ray diffraction'], [Y, Y - 1, Y - 3],
    { name: 'Quantum Materials Lab', areas: ['condensed matter physics', 'quantum materials'], capacity: 6, open: 2 }],
  ['Dr. Ayesha Khan', 'Associate Professor', 'PHY', ['photonics', 'optics', 'quantum optics'], ['matlab', 'python', 'labview', 'optics'], [Y - 1, Y - 1],
    { name: 'Photonics Lab', areas: ['photonics', 'quantum optics', 'lasers'], capacity: 5, open: 1 }],

  /* ------------------------------- MATH ------------------------------- */
  ['Dr. Prakash Hegde', 'Professor Emeritus', 'MATH', ['graph theory', 'optimization', 'network science'], ['python', 'mathematics', 'optimization'], [Y - 4, Y - 9], null],
  ['Dr. Sunita Rao', 'Associate Professor', 'MATH', ['statistics', 'bayesian inference', 'data science'], ['r', 'python', 'statistics', 'stan'], [Y, Y - 1],
    { name: 'Statistical Learning Group', areas: ['statistics', 'bayesian inference', 'data science'], capacity: 6, open: 3 }],
  ['Dr. Vinod Kumar', 'Assistant Professor', 'MATH', ['financial mathematics', 'stochastic processes', 'optimization'], ['python', 'r', 'mathematics', 'optimization'], [Y, Y - 2], null],
];

const VENUES = {
  CSE: ['NeurIPS', 'ACL', 'EMNLP', 'CVPR', 'ICML', 'IEEE TPAMI', 'ACM PLDI', 'QIP', 'IEEE VR'],
  IT: ['IEEE CLOUD', 'ACM SoCC', 'ICSE', 'IEEE Trans. Cloud Computing', 'USENIX ATC', 'ICST', 'ACM Middleware', 'IEEE Software'],
  MCA: ['IEEE Access', 'The Web Conference', 'ACM CHI', 'ACM RecSys', 'IEEE S&P', 'Springer LNCS'],
  ECE: ['IEEE TCAS', 'ICASSP', 'DAC', 'IEEE Trans. Wireless Comms', 'IEEE IoT Journal'],
  EEE: ['IEEE Trans. Power Electronics', 'IEEE Trans. Smart Grid', 'Applied Energy', 'IEEE Trans. Industrial Electronics'],
  MECH: ['ICRA', 'IROS', 'Robotics and CIM', 'Additive Manufacturing', 'J. Manufacturing Systems', 'Int. J. Heat and Mass Transfer'],
  CHEM: ['JACS', 'Angewandte Chemie', 'Green Chemistry', 'ACS Catalysis', 'J. Phys. Chem. A', 'J. Mater. Chem. A', 'Analytical Chemistry'],
  BT: ['Bioinformatics', 'Nature Comms', 'Nucleic Acids Research', 'ACS Synthetic Biology', 'Genome Biology'],
  PHY: ['Physical Review B', 'Physical Review Letters', 'Optica', 'Nature Physics'],
  MATH: ['SIAM J. Optimization', 'Annals of Statistics', 'J. Graph Theory', 'Mathematical Finance'],
};
const PAPER_FORMS = ['A Survey', 'New Methods', 'Benchmarks and Baselines', 'Lessons from Deployment', 'An Empirical Study', 'Towards Robustness', 'A Scalable Approach', 'Design and Evaluation'];
const AGENCIES = ['DST-SERB', 'DBT', 'AICTE', 'MeitY', 'ICMR', 'CSIR', 'ISRO RESPOND', 'Industry (CSR)'];

const FIRST = ['Aditi', 'Rohan', 'Priya', 'Karthik', 'Sneha', 'Arjun', 'Divya', 'Nikhil', 'Pooja', 'Varun', 'Meghana', 'Siddharth', 'Ishita', 'Harsha', 'Tanvi', 'Manoj', 'Shreya', 'Akash', 'Nandini', 'Gautam', 'Bhavana', 'Kiran', 'Ritika', 'Abhishek', 'Swathi', 'Yash', 'Anjali', 'Pranav', 'Siri', 'Rahul', 'Lavanya', 'Vivek', 'Keerthi', 'Aman', 'Sahana', 'Tejas', 'Neha', 'Omkar', 'Riya', 'Dhruv', 'Aishwarya', 'Faiz', 'Chaitra', 'Hemant', 'Zoya', 'Naveen', 'Pallavi', 'Suhas'];
const LAST = ['Sharma', 'Reddy', 'Patil', 'Gowda', 'Bhat', 'Kumar', 'Naidu', 'Desai', 'Pillai', 'Shenoy', 'Murthy', 'Kamath', 'Joshi', 'Iyer', 'Khan', 'Rao', 'Hegde', 'Menon'];

const PROGRAMS = {
  CSE: [['B.Tech', 4], ['M.Tech', 2], ['PhD', 5]],
  IT: [['B.Tech', 4], ['M.Tech', 2]],
  MCA: [['MCA', 2]],
  ECE: [['B.Tech', 4], ['M.Tech', 2]],
  EEE: [['B.Tech', 4], ['M.Tech', 2]],
  MECH: [['B.Tech', 4], ['M.Tech', 2]],
  CHEM: [['M.Sc Chemistry', 2], ['PhD', 5]],
  BT: [['M.Sc Biotech', 2], ['PhD', 5]],
  PHY: [['M.Sc Physics', 2], ['PhD', 5]],
  MATH: [['M.Sc Mathematics', 2], ['PhD', 5]],
};

const INTEREST_POOLS = {
  CSE: ['nlp', 'computer vision', 'deep learning', 'distributed systems', 'large language models', 'medical imaging', 'reinforcement learning', 'compilers', 'quantum computing'],
  IT: ['cloud computing', 'devops', 'microservices', 'spring boot', 'test automation', 'site reliability engineering', 'mlops', 'cloud security', 'serverless'],
  MCA: ['nlp', 'web development', 'cybersecurity', 'recommender systems', 'data mining', 'legal ai', 'blockchain', 'full stack development', 'spring boot'],
  ECE: ['iot', 'edge ai', 'embedded systems', 'signal processing', 'vlsi design', 'wireless communication'],
  EEE: ['electric vehicles', 'power electronics', 'renewable energy', 'smart grid', 'industrial automation'],
  MECH: ['robotics', 'industrial automation', 'additive manufacturing', 'digital twins', 'mechatronics', 'computational fluid dynamics'],
  CHEM: ['organic chemistry', 'green chemistry', 'computational chemistry', 'battery materials', 'polymer chemistry', 'analytical chemistry', 'catalysis'],
  BT: ['genomics', 'bioinformatics', 'drug discovery', 'proteomics', 'single-cell', 'synthetic biology'],
  PHY: ['condensed matter physics', 'photonics', 'quantum materials', 'quantum optics'],
  MATH: ['optimization', 'graph theory', 'statistics', 'bayesian inference', 'financial mathematics'],
};
const SKILL_POOLS = {
  CSE: ['python', 'pytorch', 'java', 'c++', 'docker', 'kubernetes', 'opencv', 'nlp', 'transformers', 'ros'],
  IT: ['java', 'spring boot', 'aws', 'azure', 'docker', 'kubernetes', 'jenkins', 'terraform', 'selenium', 'python', 'microservices', 'kafka'],
  MCA: ['python', 'javascript', 'react', 'node.js', 'mongodb', 'sql', 'nlp', 'machine learning', 'graphql', 'java', 'spring boot'],
  ECE: ['c', 'python', 'embedded systems', 'matlab', 'tinyml', 'verilog', 'fpga'],
  EEE: ['matlab', 'simulink', 'plc programming', 'python', 'power electronics', 'scada', 'embedded c'],
  MECH: ['solidworks', 'ansys', 'ros', 'python', 'matlab', 'plc programming', 'c++'],
  CHEM: ['organic synthesis', 'hplc', 'nmr spectroscopy', 'python', 'rdkit', 'gaussian', 'electrochemistry', 'chemdraw'],
  BT: ['python', 'r', 'genomics', 'bioinformatics', 'biopython', 'statistics', 'wet lab', 'crispr'],
  PHY: ['python', 'matlab', 'labview', 'optics', 'dft'],
  MATH: ['python', 'mathematics', 'r', 'optimization', 'statistics'],
};

const slug = (name) => name.replace(/^Dr\.\s*/, '').toLowerCase().replace(/[^a-z]+/g, '.');

export async function seed({ quiet = true } = {}) {
  const log = (...a) => !quiet && console.log(...a);
  s = 42;

  await Promise.all(Object.values(models).map((m) => m.deleteMany({})));
  await Promise.all(Object.values(models).map((m) => m.syncIndexes()));

  // Directory records can't be logged into: the password is random and thrown away.
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

  const depts = await Department.insertMany(DEPARTMENTS);
  const dept = Object.fromEntries(depts.map((d) => [d.code, d]));

  /* ---------------- faculty + labs + publications + grants ---------------- */
  const facultyDocs = [];
  const labDocs = [];
  for (const [i, [name, title, code, interests, skills, pubYears, labDef, verification = 'VERIFIED']] of FACULTY.entries()) {
    const f = await User.create({
      name, title, email: `${slug(name)}@${DOMAIN}`, passwordHash, role: 'FACULTY', department: dept[code]._id, verification,
      interests, skills: skills.map((n) => ({ name: n, level: 4 + (rand() > 0.5 ? 1 : 0) })),
      bio: `${title}, ${dept[code].name}. Works on ${interests.slice(0, -1).join(', ')}${interests.length > 1 ? ' and ' : ''}${interests.at(-1)}.`,
      lastActiveAt: new Date(Date.now() - Math.floor(rand() * 30) * 864e5),
    });
    facultyDocs.push(f);

    for (const [k, year] of pubYears.entries()) {
      await Publication.create({
        title: `${interests[k % interests.length].replace(/\b\w/g, (c) => c.toUpperCase())}: ${PAPER_FORMS[(i + k) % PAPER_FORMS.length]}`,
        venue: VENUES[code][(i + k) % VENUES[code].length],
        year,
        authors: [f._id],
        externalAuthors: [pick(['S. Ramachandran', 'L. Chen', 'M. Fischer', 'A. Okafor', 'J. Silva', 'R. Tanaka'])],
        keywords: pickN(interests, 2),
      });
    }

    if (labDef) {
      const lab = await Lab.create({
        name: labDef.name, description: `${labDef.name} in ${dept[code].name}, led by ${name}. Focus: ${labDef.areas.join(', ')}.`, department: dept[code]._id,
        head: f._id, members: [], researchAreas: labDef.areas, capacity: labDef.capacity, openSlots: labDef.open,
      });
      f.lab = lab._id;
      await f.save();
      labDocs.push(lab);
      if (rand() > 0.3) {
        await Grant.create({
          title: `${labDef.areas[0].replace(/\b\w/g, (c) => c.toUpperCase())} research programme`, agency: AGENCIES[i % AGENCIES.length],
          amount: Math.round(10 + rand() * 90) * 100000, startDate: new Date(Y - 1, 3, 1), endDate: new Date(Y + 2, 2, 31),
          lab: lab._id, principalInvestigator: f._id,
        });
      }
    }
  }
  const facultyByName = Object.fromEntries(facultyDocs.map((f) => [f.name, f]));

  /* --------------------------------- students -------------------------------- */
  const students = [];
  const codes = Object.keys(dept);
  const perDept = {};
  for (let i = 0; i < 90; i++) {
    const code = codes[i % codes.length];
    const nth = (perDept[code] = (perDept[code] ?? 0) + 1);
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    const [program, maxYear] = pick(PROGRAMS[code]);
    let skills = pickN(SKILL_POOLS[code], 3 + Math.floor(rand() * 3)).map((n) => ({ name: n, level: lvl() }));
    let interests = pickN(INTEREST_POOLS[code], 2 + Math.floor(rand() * 2));
    // Guarantee python + genomics students exist (every other BT student, plus one CSE crossover).
    if ((code === 'BT' && nth % 2 === 1) || i === 10) {
      skills = [...skills.filter((x) => !['python', 'genomics'].includes(x.name)), { name: 'python', level: 4 }, { name: 'genomics', level: 3 }];
      interests = [...new Set([...interests, 'genomics'])];
    }
    students.push(await User.create({
      name: `${first} ${last}`, email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@${DOMAIN}`, passwordHash, role: 'STUDENT',
      department: dept[code]._id, program, yearOfStudy: 1 + Math.floor(rand() * maxYear), skills, interests,
      lookingFor: pickN(['MENTOR', 'LAB', 'COLLABORATOR', 'PROJECT'], 1 + Math.floor(rand() * 2)),
      bio: `${program} student in ${dept[code].name}, interested in ${interests.join(', ')}.`,
      lastActiveAt: new Date(Date.now() - Math.floor(rand() * 21) * 864e5),
    }));
  }

  // Attach some students to labs in their own department (not every genomics student).
  for (const [i, st] of students.entries()) {
    if (i % 3 !== 0) continue;
    const lab = labDocs.find((l) => String(l.department) === String(st.department) && l.members.length < l.capacity - l.openSlots);
    if (!lab) continue;
    lab.members.push(st._id);
    await lab.save();
    st.lab = lab._id;
    await st.save();
  }

  // Connections
  for (const st of students) {
    const sameDept = students.filter((o) => o !== st && String(o.department) === String(st.department));
    const others = pickN(sameDept, 3);
    st.connections = [...new Set([...(st.connections || []).map(String), ...others.map((o) => String(o._id))])];
    await st.save();
  }

  /* --------------------------------- projects -------------------------------- */
  const projectDefs = [
    ['Dr. Ananya Rao', 'Legal-clause RAG assistant', 'Retrieval-augmented assistant that answers questions over contracts and cites the clause it used.', ['python', 'nlp', 'langchain'], ['nlp', 'legal ai', 'rag'], 'ACTIVE'],
    ['Dr. Ananya Rao', 'Kannada–English code-mixed sentiment', 'Sentiment model for social media posts that switch between Kannada and English mid-sentence.', ['python', 'nlp', 'transformers'], ['nlp', 'indic languages'], 'PLANNING'],
    ['Dr. Rahul Iyer', 'Single-cell atlas of oral cancer', 'Build a reference single-cell atlas from public and in-house oral cancer datasets.', ['python', 'genomics', 'r'], ['genomics', 'single-cell', 'cancer biology'], 'ACTIVE'],
    ['Dr. Rahul Iyer', 'Variant calling pipeline benchmark', 'Reproducible benchmark of variant callers on Indian population genomes.', ['python', 'bioinformatics', 'docker'], ['genomics', 'bioinformatics'], 'PLANNING'],
    ['Dr. Arjun Nair', 'Chest X-ray triage with explainability', 'Prioritise urgent chest X-rays in a district hospital queue, with saliency maps for radiologists.', ['python', 'pytorch', 'computer vision'], ['medical imaging', 'deep learning'], 'ACTIVE'],
    ['Dr. Sneha Kulkarni', 'TinyML crop-disease detector', 'Leaf-disease classifier that runs on a ₹500 microcontroller in the field.', ['c', 'tinyml', 'python'], ['edge ai', 'iot'], 'ACTIVE'],
    ['Dr. Farah Siddiqui', 'Phishing URL detection with graph features', 'Detect phishing domains using link-graph and certificate features.', ['python', 'machine learning', 'cybersecurity'], ['cybersecurity', 'privacy'], 'PLANNING'],
    ['Dr. Deepak Joshi', 'Course recommender for electives', 'Recommend electives from past grades, interests and career goals.', ['python', 'sql', 'machine learning'], ['recommender systems', 'data mining'], 'ACTIVE'],
    ['Dr. Suresh Babu', 'Serverless cost optimiser', 'Profile serverless workloads and recommend memory/timeout settings that cut cloud bills.', ['aws', 'python', 'terraform'], ['cloud computing', 'serverless'], 'ACTIVE'],
    ['Dr. Suresh Babu', 'Multi-cloud disaster recovery playbooks', 'Automated failover between AWS and Azure for the university ERP.', ['aws', 'azure', 'kubernetes'], ['cloud computing', 'multi-cloud', 'devops'], 'PLANNING'],
    ['Dr. Nisha Agarwal', 'Self-healing CI/CD pipelines', 'Detect flaky pipeline stages and auto-retry or quarantine them.', ['jenkins', 'docker', 'python'], ['devops', 'ci/cd'], 'ACTIVE'],
    ['Dr. Nisha Agarwal', 'SLO dashboard for campus services', 'Prometheus + Grafana observability for the campus portal with error-budget alerts.', ['prometheus', 'kubernetes', 'docker'], ['site reliability engineering', 'observability', 'devops'], 'PLANNING'],
    ['Dr. Rajesh Khanna', 'Spring Boot microservices for hostel management', 'Break the monolithic hostel system into Spring Boot services with Kafka events.', ['java', 'spring boot', 'kafka', 'microservices'], ['microservices', 'spring boot', 'java'], 'ACTIVE'],
    ['Dr. Rajesh Khanna', 'Event-sourced library system', 'CQRS and event sourcing with Spring Boot, Axon and PostgreSQL.', ['java', 'spring boot', 'sql'], ['event-driven architecture', 'java'], 'PLANNING'],
    ['Dr. Pooja Malhotra', 'AI-assisted test case generation', 'Generate Selenium and Playwright tests from user stories with LLMs.', ['selenium', 'java', 'python'], ['test automation', 'software testing'], 'ACTIVE'],
    ['Dr. Pooja Malhotra', 'Visual regression testing at scale', 'Cypress-based screenshot diffing for the university web apps.', ['cypress', 'javascript'], ['test automation', 'quality engineering'], 'PLANNING'],
    ['Dr. Harini Subramanian', 'MLOps platform for student projects', 'Shared MLflow + Airflow platform so student ML projects are reproducible.', ['python', 'airflow', 'mlflow', 'docker'], ['mlops', 'data engineering'], 'ACTIVE'],
    ['Dr. Anil Deshpande', 'Placement portal with Spring Boot + React', 'Rebuild the training & placement portal as a full-stack app.', ['java', 'spring boot', 'react', 'mysql'], ['full stack development', 'web development', 'spring boot'], 'ACTIVE'],
    ['Dr. Ashok Pillai', 'PLC-based bottling line digital twin', 'Simulate and control a bottling line with a PLC and a digital twin.', ['plc programming', 'scada', 'python'], ['industrial automation', 'plc', 'industry 4.0'], 'ACTIVE'],
    ['Dr. Ramesh Chandra', 'Autonomous warehouse picking robot', 'ROS-based mobile manipulator for pick-and-place in a mock warehouse.', ['ros', 'python', 'c++'], ['robotics', 'industrial automation'], 'ACTIVE'],
    ['Dr. Ramesh Chandra', 'Cobot safety zone monitoring', 'Computer vision safety zones around collaborative robots on the shop floor.', ['python', 'opencv', 'ros'], ['robotics', 'mechatronics', 'computer vision'], 'PLANNING'],
    ['Dr. Swati Kulkarni', 'Digital twin for 3D printer farm', 'Predict print failures from sensor data across 20 printers.', ['python', 'matlab'], ['additive manufacturing', 'digital twins'], 'PLANNING'],
    ['Dr. Venkatesh Prasad', 'Battery management system for e-rickshaws', 'Low-cost BMS with state-of-charge estimation for lead-acid to Li-ion retrofits.', ['embedded c', 'matlab', 'simulink'], ['electric vehicles', 'battery management systems'], 'ACTIVE'],
    ['Dr. Kalpana Reddy', 'Rooftop solar forecasting for campus', 'Forecast campus rooftop solar generation for smarter grid scheduling.', ['python', 'matlab'], ['renewable energy', 'smart grid'], 'ACTIVE'],
    ['Dr. Priya Raghavan', 'Solvent-free catalytic amide synthesis', 'Green catalytic routes to amide bonds without halogenated solvents.', ['organic synthesis', 'nmr spectroscopy', 'hplc'], ['green chemistry', 'catalysis', 'organic chemistry'], 'ACTIVE'],
    ['Dr. Arvind Saxena', 'ML screening of battery electrolytes', 'Screen candidate electrolyte molecules with DFT descriptors and graph neural networks.', ['python', 'rdkit', 'gaussian'], ['computational chemistry', 'cheminformatics', 'battery materials'], 'PLANNING'],
    ['Dr. Fatima Sheikh', 'Sodium-ion cathode materials', 'Synthesise and characterise layered oxide cathodes for sodium-ion cells.', ['electrochemistry', 'x-ray diffraction', 'materials synthesis'], ['battery materials', 'electrochemistry'], 'ACTIVE'],
    ['Dr. Shweta Patil', 'CRISPR-engineered yeast for vanillin', 'Metabolic engineering of yeast to produce natural vanillin.', ['wet lab', 'crispr'], ['synthetic biology', 'metabolic engineering'], 'ACTIVE'],
    ['Dr. Sunita Rao', 'Bayesian models for exam-result early warning', 'Flag students at risk early using hierarchical Bayesian models.', ['r', 'stan', 'statistics'], ['statistics', 'bayesian inference', 'data science'], 'PLANNING'],
    ['Dr. Gopal Krishna', 'Hardware trojan detection on FPGAs', 'Detect inserted trojans using side-channel power traces.', ['verilog', 'fpga', 'python'], ['hardware security', 'fpga'], 'PLANNING'],
  ];
  const projectDocs = [];
  for (const [owner, title, description, requiredSkills, tags, status] of projectDefs) {
    const f = facultyByName[owner];
    const labMembers = f.lab ? (labDocs.find((l) => String(l._id) === String(f.lab))?.members ?? []) : [];
    projectDocs.push(await Project.create({
      title, description, owner: f._id, lab: f.lab,
      members: [f._id, ...labMembers.slice(0, 1)], requiredSkills, tags, status, isOpen: true, maxMembers: 4 + Math.floor(rand() * 3),
    }));
  }
  // A student-owned project
  const webStudent = students.find((st) => st.skills.some((k) => k.name === 'javascript'));
  if (webStudent) {
    await Project.create({
      title: 'Campus research-collab Discord bot', description: 'Bot that pings people when matching projects open.',
      owner: webStudent._id, members: [webStudent._id], requiredSkills: ['javascript', 'node.js', 'graphql'],
      tags: ['web development', 'nlp'], status: 'PLANNING', isOpen: true, maxMembers: 4,
    });
  }

  /* ------------------------ join requests (activity history) ----------------------- */
  const unattached = students.filter((st) => !st.lab);
  const labByName = Object.fromEntries(labDocs.map((l) => [l.name, l]));
  const genomicsStudent = unattached.find((st) => st.skills.some((k) => k.name === 'genomics'));
  const requestDefs = [
    [genomicsStudent, 'LAB', labByName['Computational Genomics Lab'], 'PENDING', 'I have worked on RNA-seq pipelines in Python and would love to join.'],
    [unattached.find((st) => st.skills.some((k) => k.name === 'spring boot')), 'LAB', labByName['Enterprise Software Engineering Lab'], 'PENDING', 'Built two Spring Boot REST services in my internship.'],
    [unattached.find((st) => st.skills.some((k) => k.name === 'organic synthesis')), 'PROJECT', projectDocs.find((p) => p.title.startsWith('Solvent-free')), 'PENDING', 'Keen to learn green catalysis.'],
    [unattached.find((st) => st.skills.some((k) => k.name === 'jenkins')), 'PROJECT', projectDocs.find((p) => p.title.startsWith('Self-healing')), 'REJECTED', ''],
    [unattached.find((st) => st.skills.some((k) => k.name === 'ros')), 'PROJECT', projectDocs.find((p) => p.title.startsWith('Autonomous warehouse')), 'WITHDRAWN', ''],
  ];
  for (const [st, targetType, target, status, message] of requestDefs) {
    if (!st || !target) continue;
    const isLab = targetType === 'LAB';
    const recipient = isLab ? target.head : target.owner;
    const jr = await JoinRequest.create({
      requester: st._id, recipient, targetType, status, message,
      lab: isLab ? target._id : target.lab ?? null, project: isLab ? null : target._id,
    });
    if (status === 'PENDING') {
      await Notification.create({
        recipient, type: 'JOIN_REQUEST', message: `${st.name} requested to join your ${isLab ? 'lab' : 'project'} "${target.name ?? target.title}"`,
        actor: st._id, lab: jr.lab, project: jr.project, joinRequest: jr._id,
      });
    }
  }
  // One accepted request: a student who joined a project.
  const accepted = projectDocs.find((p) => p.title.startsWith('Placement portal'));
  const acceptedStudent = students.find((st) => st.skills.some((k) => k.name === 'react') && !accepted.members.some((m) => String(m) === String(st._id)));
  if (accepted && acceptedStudent) {
    await JoinRequest.create({ requester: acceptedStudent._id, recipient: accepted.owner, targetType: 'PROJECT', project: accepted._id, lab: accepted.lab, status: 'ACCEPTED' });
    accepted.members.push(acceptedStudent._id);
    await accepted.save();
  }

  const counts = Object.fromEntries(await Promise.all(Object.entries(models).map(async ([k, m]) => [k, await m.countDocuments()])));
  log('🌱 Seeded university directory:', counts);
  log('   Directory profiles cannot be logged into — create your own account from the sign-up page.');
  return counts;
}

/** First start against a fresh database: load the directory. Never touches a database that has data. */
export async function seedIfEmpty(opts = { quiet: false }) {
  if (await Department.estimatedDocumentCount()) return false;
  console.log('📦 Empty database — loading the university directory (first run only)…');
  await seed(opts);
  return true;
}

// Run directly: `node src/seed/seed.js`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/researchmesh';
  await mongoose.connect(uri);
  await seed({ quiet: false });
  await mongoose.disconnect();
}
