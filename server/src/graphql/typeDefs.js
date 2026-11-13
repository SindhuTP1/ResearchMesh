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
  enum NotificationType { JOIN_REQUEST REQUEST_ACCEPTED REQUEST_REJECTED MATCHING_OPENING NEW_CONNECTION ACCOUNT_UPDATE CONNECTION_REQUEST PROJECT_INVITE }
  enum RequestKind { REQUEST INVITE }
  "How the caller relates to a user"
  enum ConnectionStatus { SELF NONE OUTGOING INCOMING CONNECTED }
  enum ConversationType { DIRECT GROUP }
  enum MessageKind { TEXT SYSTEM }
  "WebRTC signalling over the GraphQL WebSocket"
  enum CallSignalType { RING JOIN LEAVE OFFER ANSWER ICE DECLINE }
  enum Verification { PENDING VERIFIED REJECTED }
  enum FacultySort { RELEVANCE RECENT_PAPERS OPEN_SLOTS NAME RECENTLY_ACTIVE }
  enum StudentSort { RECENTLY_ACTIVE NAME YEAR }

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
    "Faculty only: admin verification state"
    verification: Verification
    "Students and admins are always true; faculty once an admin has verified them"
    isVerified: Boolean!
    lastActiveAt: DateTime
    createdAt: DateTime!
    "Caller's relationship to this user"
    connectionStatus: ConnectionStatus!
    "Pending request between the caller and this user, if any (to accept/withdraw from a profile)"
    pendingConnectionRequestId: ID
    "Has an open ResearchMesh tab right now"
    isOnline: Boolean!
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
    "REQUEST: requester wants to join. INVITE: requester (owner) invited recipient."
    kind: RequestKind!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type ConnectionRequest {
    id: ID!
    from: User!
    to: User!
    message: String
    status: RequestStatus!
    createdAt: DateTime!
  }

  type Conversation {
    id: ID!
    type: ConversationType!
    "Group name, or the other person's name for a direct chat"
    title: String!
    name: String
    description: String
    members: [User!]!
    memberCount: Int!
    admins: [User!]!
    createdBy: User
    "For DIRECT chats: the other person"
    otherUser: User
    project: Project
    lab: Lab
    lastMessage: Message
    lastMessageAt: DateTime!
    unreadCount: Int!
    "When each member last read the conversation (read receipts)"
    readBy: [ReadReceipt!]!
    "Can the caller rename it and add/remove people?"
    canManage: Boolean!
    createdAt: DateTime!
  }

  type Message {
    id: ID!
    conversationId: ID!
    sender: User
    kind: MessageKind!
    "Empty when the message is only an attachment, or was deleted"
    body: String!
    attachment: Attachment
    reactions: [Reaction!]!
    editedAt: DateTime
    isDeleted: Boolean!
    createdAt: DateTime!
  }

  type Attachment {
    id: ID!
    name: String!
    mime: String!
    size: Int!
    isImage: Boolean!
    "Path to download it; append ?token=<jwt>"
    url: String!
  }

  type Reaction {
    emoji: String!
    count: Int!
    users: [User!]!
    "Did the caller react with this emoji?"
    mine: Boolean!
  }

  type ReadReceipt {
    user: User!
    at: DateTime!
  }

  type TypingEvent {
    conversationId: ID!
    user: User!
    typing: Boolean!
  }

  type ConversationReadEvent {
    conversationId: ID!
    userId: ID!
    at: DateTime!
  }

  type PresenceEvent {
    userId: ID!
    online: Boolean!
  }

  type MessagePage {
    items: [Message!]!
    hasMore: Boolean!
  }

  type CallSignal {
    conversationId: ID!
    callId: String!
    type: CallSignalType!
    from: User!
    "Set for signals meant for one peer (OFFER, ANSWER, ICE, directed JOIN)"
    to: ID
    "JSON: SDP or ICE candidate"
    payload: String
  }

  type TeammateBreakdown {
    interest: Float!
    skill: Float!
    complement: Float!
  }

  type TeammateMatch {
    student: User!
    score: Float!
    breakdown: TeammateBreakdown!
    reasons: [String!]!
    sharedInterests: [String!]!
    newSkills: [String!]!
  }

  type TeammateResult {
    totalCount: Int!
    items: [TeammateMatch!]!
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

  type ProjectMatch {
    project: Project!
    score: Float!
    reasons: [String!]!
  }

  type FacetCount {
    value: String!
    count: Int!
  }

  "Values that actually occur in the data, for building filter dropdowns and chips"
  type FilterOptions {
    areas: [FacetCount!]!
    skills: [FacetCount!]!
    titles: [String!]!
    programs: [String!]!
  }

  type DepartmentStat {
    department: Department!
    faculty: Int!
    students: Int!
    labs: Int!
    openSlots: Int!
    activeResearchers: Int!
    openProjects: Int!
  }

  type RequestStats {
    pending: Int!
    accepted: Int!
    rejected: Int!
    withdrawn: Int!
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
    admins: Int!
    pendingVerifications: Int!
    activeResearchers: Int!
    totalCapacity: Int!
    filledSeats: Int!
    requests: RequestStats!
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
    "Match ANY of these research areas (combined with 'area' if both are given)"
    areas: [String!]
    "Designations, e.g. ['Professor', 'Associate Professor']"
    titles: [String!]
    "If true, faculty need ANY of 'skills' instead of ALL of them"
    matchAnySkill: Boolean
    "Minimum number of publications in the last 2 years"
    minRecentPublications: Int
    "Only faculty who head a lab"
    hasLab: Boolean
    "Only admin-verified faculty"
    verifiedOnly: Boolean
    "Name contains"
    name: String
    sortBy: FacultySort = RELEVANCE
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
    programs: [String!]
    years: [Int!]
    lookingFor: [LookingFor!]
    name: String
    minSkillLevel: Int
    sortBy: StudentSort = RECENTLY_ACTIVE
    limit: Int = 20
    offset: Int = 0
  }

  input TeammateSearchInput {
    "Any of these interests"
    interests: [String!]
    "All of these skills"
    skills: [String!]
    departmentId: ID
    years: [Int!]
    programs: [String!]
    "Only students who said they're looking for collaborators or a project"
    lookingForTeam: Boolean
    "Hide people you're already connected with"
    excludeConnected: Boolean
    name: String
    limit: Int = 20
    offset: Int = 0
  }

  input GroupInput {
    name: String!
    description: String
    memberIds: [ID!]!
  }

  input CallSignalInput {
    conversationId: ID!
    callId: String!
    type: CallSignalType!
    to: ID
    payload: String
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
    yearOfStudy: Int
    title: String
    "Required when role is ADMIN"
    adminCode: String
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
    "mine = projects the caller owns"
    projects(status: ProjectStatus, openOnly: Boolean, tag: String, mine: Boolean, limit: Int = 30): [Project!]!
    project(id: ID!): Project

    "e.g. faculty working on NLP who published in the last 2 years and have an open lab slot"
    searchFaculty(input: FacultySearchInput!): UserSearchResult!
    "e.g. students with python + genomics who aren't attached to a lab (faculty only)"
    searchStudents(input: StudentSearchInput!): UserSearchResult! @auth(requires: FACULTY)

    "Ranked mentor recommendations for the logged-in user"
    recommendedMentors(limit: Int = 10, weights: MatchWeightsInput): [FacultyMatch!]!
    "Open projects ranked for the logged-in student"
    recommendedProjects(limit: Int = 6): [ProjectMatch!]!
    filterOptions(role: Role!): FilterOptions!
    "Ranked students for a project you own"
    recommendedStudentsForProject(projectId: ID!, limit: Int = 10): [StudentMatch!]!

    myJoinRequests(direction: RequestDirection!, status: RequestStatus): [JoinRequest!]!
    notifications(unreadOnly: Boolean = false, limit: Int = 30): [Notification!]!
    unreadNotificationCount: Int!

    "Fellow students ranked as teammates for the caller"
    findTeammates(input: TeammateSearchInput!): TeammateResult!
    myConnections: [User!]!
    connectionRequests(direction: RequestDirection!): [ConnectionRequest!]!
    "People the caller may message or add to a group: connections, project teammates, lab members"
    chatContacts(search: String): [User!]!
    conversations: [Conversation!]!
    conversation(id: ID!): Conversation
    "Newest first; pass 'before' (a message's createdAt) to page back"
    messages(conversationId: ID!, before: DateTime, limit: Int = 40): MessagePage!
    unreadMessageCount: Int!
    "VAPID public key for Web Push subscriptions"
    pushPublicKey: String

    adminStats: AdminStats! @auth(requires: ADMIN)
    allUsers(role: Role, limit: Int = 50): [User!]! @auth(requires: ADMIN)
    departmentStats: [DepartmentStat!]! @auth(requires: ADMIN)
    pendingVerifications: [User!]! @auth(requires: ADMIN)
    "All join requests on the platform, newest first"
    recentJoinRequests(limit: Int = 20): [JoinRequest!]! @auth(requires: ADMIN)
  }

  type Mutation {
    register(input: RegisterInput!): AuthPayload!
    "role = the portal the user chose; login fails if the account has a different role"
    login(email: String!, password: String!, role: Role): AuthPayload!

    updateProfile(input: UpdateProfileInput!): User!
    "Ask to connect. If they had already asked you, this accepts their request instead."
    sendConnectionRequest(userId: ID!, message: String): User!
    respondToConnectionRequest(id: ID!, accept: Boolean!): ConnectionRequest!
    withdrawConnectionRequest(id: ID!): ConnectionRequest!
    removeConnection(userId: ID!): User!

    "Project owner invites someone; they accept or decline from their requests"
    inviteToProject(projectId: ID!, userId: ID!, message: String): JoinRequest!

    openDirectConversation(userId: ID!): Conversation!
    createGroupConversation(input: GroupInput!): Conversation!
    "Find or create the group chat for a project (members only); everyone on the project is added"
    openProjectConversation(projectId: ID!): Conversation!
    "Find or create the group chat for a lab (head or members); the head and all members are added"
    openLabConversation(labId: ID!): Conversation!
    addConversationMembers(conversationId: ID!, userIds: [ID!]!): Conversation!
    removeConversationMember(conversationId: ID!, userId: ID!): Conversation!
    leaveConversation(conversationId: ID!): Boolean!
    updateConversation(conversationId: ID!, name: String, description: String): Conversation!
    "Text, an attachment (upload it to /api/upload first), or both"
    sendMessage(conversationId: ID!, body: String, attachmentId: ID): Message!
    "Edit your own message"
    editMessage(id: ID!, body: String!): Message!
    "Delete your own message (group admins can delete any message in their group)"
    deleteMessage(id: ID!): Message!
    "Add or remove your reaction"
    toggleReaction(messageId: ID!, emoji: String!): Message!
    "Tell the others you're typing (send true every few seconds while typing, false when you stop)"
    setTyping(conversationId: ID!, typing: Boolean!): Boolean!
    "Register this browser for push notifications (the JSON from PushSubscription.toJSON())"
    savePushSubscription(subscription: String!): Boolean!
    removePushSubscription(endpoint: String!): Boolean!
    markConversationRead(conversationId: ID!): Conversation!
    sendCallSignal(input: CallSignalInput!): Boolean!

    createProject(input: ProjectInput!): Project!
    updateProject(id: ID!, input: UpdateProjectInput!): Project!
    deleteProject(id: ID!): Boolean!

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
    verifyFaculty(userId: ID!, approve: Boolean!): User! @auth(requires: ADMIN)
    createDepartment(name: String!, code: String!): Department! @auth(requires: ADMIN)
  }

  type Subscription {
    "Real-time notifications for the connected user (join requests, decisions, matching openings)"
    notificationAdded: Notification!
    "Fires when a join request you sent or received changes"
    joinRequestChanged: JoinRequest!
    "New messages in any conversation the caller belongs to"
    messageAdded: Message!
    "A conversation the caller is in (or was just removed from) changed"
    conversationChanged: Conversation!
    "Video-call signalling addressed to the caller"
    callSignal: CallSignal!
    "A message was edited, deleted or reacted to"
    messageUpdated: Message!
    "Someone started/stopped typing in one of the caller's conversations"
    typing: TypingEvent!
    "Someone read a conversation the caller is in (read receipts)"
    conversationRead: ConversationReadEvent!
    "Someone the caller chats with came online or went offline"
    presenceChanged: PresenceEvent!
  }
`;
