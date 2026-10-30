export const typeDefs = /* GraphQL */ `
  """
  Role-based access is declared in the schema itself.
  A field/type marked @auth(requires: FACULTY) is only resolvable by FACULTY or ADMIN.
  Fields on the caller's own User are always readable (see "self" rule in authDirective.js).
  """
  directive @auth(requires: Role = STUDENT) on OBJECT | FIELD_DEFINITION

  scalar DateTime

  enum Role { STUDENT FACULTY ADMIN }
  enum ProjectStatus { PLANNING ACTIVE ON_HOLD COMPLETED }
  enum RequestStatus { PENDING ACCEPTED REJECTED WITHDRAWN }
  enum RequestTarget { PROJECT LAB }
  enum RequestDirection { INCOMING OUTGOING }
  enum LookingFor { MENTOR LAB COLLABORATOR PROJECT }
  enum NotificationType { JOIN_REQUEST REQUEST_ACCEPTED REQUEST_REJECTED MATCHING_OPENING NEW_CONNECTION }

  type Department {
    id: ID!
    name: String!
    code: String!
    labs: [Lab!]!
    facultyCount: Int!
  }

  type Skill {
    name: String!
    "1 = beginner … 5 = expert"
    level: Int!
  }

  type User {
    id: ID!
    name: String!
    "Visible to the user themselves, faculty and admins only"
    email: String! @auth(requires: FACULTY)
    role: Role!
    department: Department
    bio: String
    skills: [Skill!]!
    interests: [String!]!
    lab: Lab
    connections(limit: Int = 20): [User!]!
    connectionCount: Int!
    projects: [Project!]!
    "Publications, newest first. sinceYear filters e.g. 'last 2 years'."
    publications(sinceYear: Int, limit: Int): [Publication!]!
    publicationCount: Int!
    "Publications in the last 2 calendar years"
    recentPublicationCount: Int!
    "True if they published within the last 2 years — 'active now', not 5 years ago"
    isActiveResearcher: Boolean!
    # student
    yearOfStudy: Int
    program: String
    lookingFor: [LookingFor!]!
    # faculty
    title: String
    lastActiveAt: DateTime
    createdAt: DateTime!
  }

  type Lab {
    id: ID!
    name: String!
    description: String
    department: Department!
    head: User!
    members: [User!]!
    memberCount: Int!
    researchAreas: [String!]!
    capacity: Int!
    openSlots: Int!
    projects: [Project!]!
    "Funding data — faculty/admin only"
    grants: [Grant!]! @auth(requires: FACULTY)
    totalActiveFunding: Float! @auth(requires: FACULTY)
    "Lab-head dashboard: pending requests to join this lab or its projects"
    pendingRequests: [JoinRequest!]! @auth(requires: FACULTY)
  }

  type Project {
    id: ID!
    title: String!
    description: String
    owner: User!
    lab: Lab
    members: [User!]!
    requiredSkills: [String!]!
    tags: [String!]!
    status: ProjectStatus!
    isOpen: Boolean!
    maxMembers: Int!
    seatsLeft: Int!
    "Has the current user already requested to join?"
    myRequestStatus: RequestStatus
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Publication {
    id: ID!
    title: String!
    venue: String
    year: Int!
    doi: String
    url: String
    authors: [User!]!
    externalAuthors: [String!]!
    keywords: [String!]!
  }

  type Grant {
    id: ID!
    title: String!
    agency: String!
    amount: Float!
    currency: String!
    startDate: DateTime!
    endDate: DateTime!
    isActive: Boolean!
    lab: Lab!
    principalInvestigator: User!
  }

  type JoinRequest {
    id: ID!
    requester: User!
    recipient: User!
    targetType: RequestTarget!
    project: Project
    lab: Lab
    message: String
    status: RequestStatus!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Notification {
    id: ID!
    type: NotificationType!
    message: String!
    read: Boolean!
    actor: User
    project: Project
    lab: Lab
    joinRequest: JoinRequest
    createdAt: DateTime!
  }

  type MatchBreakdown {
    skill: Float!
    interest: Float!
    recency: Float!
    availability: Float!
  }

  type FacultyMatch {
    faculty: User!
    score: Float!
    breakdown: MatchBreakdown!
    reasons: [String!]!
  }

  type StudentMatch {
    student: User!
    score: Float!
    breakdown: MatchBreakdown!
    reasons: [String!]!
  }

  type UserSearchResult {
    totalCount: Int!
    items: [User!]!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type AdminStats {
    users: Int!
    students: Int!
    faculty: Int!
    labs: Int!
    openProjects: Int!
    pendingRequests: Int!
    unattachedStudents: Int!
  }

  input FacultySearchInput {
    "Free-text research area, matched against interests, lab areas and recent publication keywords (e.g. 'nlp')"
    area: String
    skills: [String!]
    "Only faculty who published within this many years (e.g. 2)"
    publishedWithinYears: Int
    "Only faculty whose lab currently has an open slot"
    hasOpenSlots: Boolean
    departmentId: ID
    limit: Int = 20
    offset: Int = 0
  }

  input StudentSearchInput {
    "Student must have ALL of these skills (e.g. ['python','genomics'])"
    skills: [String!]
    "Only students not yet attached to any lab"
    unattached: Boolean
    interests: [String!]
    departmentId: ID
    program: String
    minSkillLevel: Int
    limit: Int = 20
    offset: Int = 0
  }

  input MatchWeightsInput {
    skill: Float
    interest: Float
    recency: Float
    availability: Float
  }

  input SkillInput {
    name: String!
    level: Int = 3
  }

  input RegisterInput {
    name: String!
    email: String!
    password: String!
    role: Role!
    departmentId: ID
    program: String
    title: String
  }

  input UpdateProfileInput {
    name: String
    bio: String
    skills: [SkillInput!]
    interests: [String!]
    departmentId: ID
    yearOfStudy: Int
    program: String
    lookingFor: [LookingFor!]
    title: String
  }

  input ProjectInput {
    title: String!
    description: String
    labId: ID
    requiredSkills: [String!]
    tags: [String!]
    status: ProjectStatus
    isOpen: Boolean
    maxMembers: Int
  }

  input UpdateProjectInput {
    title: String
    description: String
    requiredSkills: [String!]
    tags: [String!]
    status: ProjectStatus
    isOpen: Boolean
    maxMembers: Int
  }

  input LabInput {
    name: String!
    description: String
    departmentId: ID!
    researchAreas: [String!]
    capacity: Int
    openSlots: Int
  }

  input UpdateLabInput {
    name: String
    description: String
    researchAreas: [String!]
    capacity: Int
    openSlots: Int
  }

  input PublicationInput {
    title: String!
    venue: String
    year: Int!
    doi: String
    url: String
    coAuthorIds: [ID!]
    externalAuthors: [String!]
    keywords: [String!]
  }

  input GrantInput {
    title: String!
    agency: String!
    amount: Float!
    currency: String
    startDate: DateTime!
    endDate: DateTime!
    labId: ID!
  }

  type Query {
    me: User
    user(id: ID!): User
    departments: [Department!]!
    labs(area: String, hasOpenSlots: Boolean): [Lab!]!
    lab(id: ID!): Lab
    projects(status: ProjectStatus, openOnly: Boolean, tag: String, limit: Int = 30): [Project!]!
    project(id: ID!): Project

    "e.g. faculty working on NLP who published in the last 2 years and have an open lab slot"
    searchFaculty(input: FacultySearchInput!): UserSearchResult!
    "e.g. students with python + genomics who aren't attached to a lab (faculty only)"
    searchStudents(input: StudentSearchInput!): UserSearchResult! @auth(requires: FACULTY)

    "Ranked mentor recommendations for the logged-in user"
    recommendedMentors(limit: Int = 10, weights: MatchWeightsInput): [FacultyMatch!]!
    "Ranked students for a project you own"
    recommendedStudentsForProject(projectId: ID!, limit: Int = 10): [StudentMatch!]!

    myJoinRequests(direction: RequestDirection!, status: RequestStatus): [JoinRequest!]!
    notifications(unreadOnly: Boolean = false, limit: Int = 30): [Notification!]!
    unreadNotificationCount: Int!

    adminStats: AdminStats! @auth(requires: ADMIN)
    allUsers(role: Role, limit: Int = 50): [User!]! @auth(requires: ADMIN)
  }

  type Mutation {
    register(input: RegisterInput!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!

    updateProfile(input: UpdateProfileInput!): User!
    connect(userId: ID!): User!

    createProject(input: ProjectInput!): Project!
    updateProject(id: ID!, input: UpdateProjectInput!): Project!

    createLab(input: LabInput!): Lab! @auth(requires: FACULTY)
    "Raising openSlots notifies students whose interests match the lab"
    updateLab(id: ID!, input: UpdateLabInput!): Lab! @auth(requires: FACULTY)

    addPublication(input: PublicationInput!): Publication!
    addGrant(input: GrantInput!): Grant! @auth(requires: FACULTY)

    requestToJoin(targetType: RequestTarget!, targetId: ID!, message: String): JoinRequest!
    respondToJoinRequest(id: ID!, accept: Boolean!): JoinRequest!
    withdrawJoinRequest(id: ID!): JoinRequest!

    markNotificationsRead(ids: [ID!]): Int!

    setUserRole(userId: ID!, role: Role!): User! @auth(requires: ADMIN)
    deleteUser(userId: ID!): Boolean! @auth(requires: ADMIN)
  }

  type Subscription {
    "Real-time notifications for the connected user (join requests, decisions, matching openings)"
    notificationAdded: Notification!
    "Fires when a join request you sent or received changes"
    joinRequestChanged: JoinRequest!
  }
`;
