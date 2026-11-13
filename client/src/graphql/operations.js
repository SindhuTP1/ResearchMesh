import { gql } from '@apollo/client';

/* ------------------------------------------------------------------
 * Fragments — each view asks for exactly the shape it renders.
 * A search card needs ~8 fields; a full profile needs publications,
 * connections and projects; a lab dashboard needs members + grants.
 * Same User type, three very different payloads, one endpoint.
 * ------------------------------------------------------------------ */

export const USER_CARD = gql`
  fragment UserCard on User {
    id
    name
    role
    title
    program
    interests
    skills { name level }
    department { id code name }
    lab { id name openSlots }
    recentPublicationCount
    isActiveResearcher
    isVerified
    connectionStatus
    pendingConnectionRequestId
  }
`;

export const PROJECT_CARD = gql`
  fragment ProjectCard on Project {
    id
    title
    description
    status
    isOpen
    tags
    requiredSkills
    seatsLeft
    maxMembers
    myRequestStatus
    owner { id name role }
    lab { id name }
  }
`;

export const NOTIFICATION_FIELDS = gql`
  fragment NotificationFields on Notification {
    id
    type
    message
    read
    createdAt
    actor { id name }
    project { id title }
    lab { id name }
    joinRequest { id status }
  }
`;

export const JOIN_REQUEST_FIELDS = gql`
  fragment JoinRequestFields on JoinRequest {
    id
    kind
    status
    targetType
    message
    createdAt
    requester { id name program skills { name level } department { code } }
    recipient { id name }
    project { id title }
    lab { id name }
  }
`;

/* ------------------------------- auth ------------------------------- */
export const ME = gql`
  query Me {
    me {
      id
      name
      email
      role
      title
      program
      verification
      isVerified
      department { id code name }
      lab { id name }
    }
  }
`;

export const LOGIN = gql`
  mutation Login($email: String!, $password: String!, $role: Role) {
    login(email: $email, password: $password, role: $role) { token user { id name role } }
  }
`;

export const REGISTER = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) { token user { id name role } }
  }
`;

export const DEPARTMENTS = gql`
  query Departments {
    departments { id name code }
  }
`;

/* ------------------------------ search ------------------------------ */
export const SEARCH_FACULTY = gql`
  ${USER_CARD}
  query SearchFaculty($input: FacultySearchInput!) {
    searchFaculty(input: $input) {
      totalCount
      items { ...UserCard }
    }
  }
`;

export const SEARCH_STUDENTS = gql`
  ${USER_CARD}
  query SearchStudents($input: StudentSearchInput!) {
    searchStudents(input: $input) {
      totalCount
      items { ...UserCard yearOfStudy lookingFor }
    }
  }
`;

export const RECOMMENDED_MENTORS = gql`
  ${USER_CARD}
  query RecommendedMentors($limit: Int, $weights: MatchWeightsInput) {
    recommendedMentors(limit: $limit, weights: $weights) {
      score
      reasons
      breakdown { skill interest recency availability }
      faculty { ...UserCard }
    }
  }
`;

export const FILTER_OPTIONS = gql`
  query FilterOptions($role: Role!) {
    filterOptions(role: $role) {
      areas { value count }
      skills { value count }
      titles
      programs
    }
  }
`;

/* ----------------------------- dashboards --------------------------- */
export const STUDENT_DASHBOARD = gql`
  ${USER_CARD}
  ${PROJECT_CARD}
  ${JOIN_REQUEST_FIELDS}
  query StudentDashboard {
    me {
      id name bio program yearOfStudy interests lookingFor
      skills { name level }
      department { id code name }
      lab { id name researchAreas head { id name } }
    }
    recommendedMentors(limit: 8) {
      score
      reasons
      faculty { ...UserCard }
    }
    recommendedProjects(limit: 8) {
      score
      reasons
      project { ...ProjectCard }
    }
    myJoinRequests(direction: OUTGOING) { ...JoinRequestFields }
    invites: myJoinRequests(direction: INCOMING, status: PENDING) { id project { id title } requester { id name } }
    labs(hasOpenSlots: true) {
      id name researchAreas openSlots
      department { code }
      head { id name }
    }
  }
`;

export const FACULTY_DASHBOARD = gql`
  ${JOIN_REQUEST_FIELDS}
  ${PROJECT_CARD}
  query FacultyDashboard {
    me {
      id name title verification isVerified recentPublicationCount publicationCount
      department { id name code }
      lab { id name capacity openSlots memberCount totalActiveFunding researchAreas }
      publications { id year title venue keywords }
    }
    myJoinRequests(direction: INCOMING, status: PENDING) { ...JoinRequestFields }
    projects(mine: true, limit: 50) { ...ProjectCard createdAt members { id } }
  }
`;

export const MY_PROJECTS = gql`
  ${PROJECT_CARD}
  query MyProjects {
    projects(mine: true, limit: 100) { ...ProjectCard createdAt members { id name } }
  }
`;

export const MY_PUBLICATIONS = gql`
  query MyPublications {
    me {
      id publicationCount recentPublicationCount
      publications { id title venue year keywords doi url authors { id name } externalAuthors }
    }
  }
`;

export const DELETE_PROJECT = gql`
  mutation DeleteProject($id: ID!) {
    deleteProject(id: $id)
  }
`;

export const RECOMMENDED_PROJECTS = gql`
  ${PROJECT_CARD}
  query RecommendedProjects($limit: Int) {
    recommendedProjects(limit: $limit) { score reasons project { ...ProjectCard } }
  }
`;

/* ------------------------------ profile ----------------------------- */
export const USER_PROFILE = gql`
  ${USER_CARD}
  ${PROJECT_CARD}
  query UserProfile($id: ID!) {
    user(id: $id) {
      ...UserCard
      verification
      email
      bio
      yearOfStudy
      lookingFor
      connectionCount
      publicationCount
      lastActiveAt
      lab { id name researchAreas openSlots head { id name } }
      connections(limit: 12) { id name role department { code } }
      publications(limit: 20) { id title venue year keywords authors { id name } externalAuthors }
      projects { ...ProjectCard }
    }
  }
`;

export const MY_PROFILE_EDIT = gql`
  query MyProfileEdit {
    me {
      id
      name
      bio
      title
      program
      yearOfStudy
      interests
      lookingFor
      role
      skills { name level }
      department { id }
    }
    departments { id name code }
  }
`;

export const UPDATE_PROFILE = gql`
  mutation UpdateProfile($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      id name bio title program yearOfStudy interests lookingFor
      skills { name level }
      department { id code name }
    }
  }
`;


export const ADD_PUBLICATION = gql`
  mutation AddPublication($input: PublicationInput!) {
    addPublication(input: $input) { id title year venue keywords }
  }
`;

/* ------------------------------ projects ---------------------------- */
export const PROJECTS = gql`
  ${PROJECT_CARD}
  query Projects($status: ProjectStatus, $openOnly: Boolean, $tag: String, $limit: Int) {
    projects(status: $status, openOnly: $openOnly, tag: $tag, limit: $limit) { ...ProjectCard }
  }
`;

export const PROJECT_DETAIL = gql`
  ${PROJECT_CARD}
  query ProjectDetail($id: ID!) {
    project(id: $id) {
      ...ProjectCard
      createdAt
      members { id name role program department { code } }
    }
  }
`;

export const RECOMMENDED_STUDENTS = gql`
  ${USER_CARD}
  query RecommendedStudents($projectId: ID!) {
    recommendedStudentsForProject(projectId: $projectId, limit: 8) {
      score
      reasons
      breakdown { skill interest recency availability }
      student { ...UserCard }
    }
  }
`;

export const CREATE_PROJECT = gql`
  ${PROJECT_CARD}
  mutation CreateProject($input: ProjectInput!) {
    createProject(input: $input) { ...ProjectCard }
  }
`;

export const UPDATE_PROJECT = gql`
  ${PROJECT_CARD}
  mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {
    updateProject(id: $id, input: $input) { ...ProjectCard }
  }
`;

export const REQUEST_TO_JOIN = gql`
  mutation RequestToJoin($targetType: RequestTarget!, $targetId: ID!, $message: String) {
    requestToJoin(targetType: $targetType, targetId: $targetId, message: $message) {
      id
      status
      project { id myRequestStatus }
    }
  }
`;

/* -------------------------------- labs ------------------------------ */
export const LABS = gql`
  query Labs($area: String, $hasOpenSlots: Boolean) {
    labs(area: $area, hasOpenSlots: $hasOpenSlots) {
      id name description researchAreas openSlots capacity memberCount
      department { code }
      head { id name title }
    }
  }
`;

/** Faculty dashboard — the most deeply nested view in the app, still one request. */
export const LAB_DASHBOARD = gql`
  ${JOIN_REQUEST_FIELDS}
  query LabDashboard($id: ID!) {
    lab(id: $id) {
      id name description researchAreas capacity openSlots memberCount
      department { name }
      head { id name }
      members { id name program yearOfStudy skills { name level } projects { id title } }
      projects { id title status isOpen seatsLeft members { id name } }
      grants { id title agency amount currency startDate endDate isActive }
      totalActiveFunding
      pendingRequests { ...JoinRequestFields }
    }
  }
`;

export const CREATE_LAB = gql`
  mutation CreateLab($input: LabInput!) {
    createLab(input: $input) { id name }
  }
`;

export const UPDATE_LAB = gql`
  mutation UpdateLab($id: ID!, $input: UpdateLabInput!) {
    updateLab(id: $id, input: $input) { id name description researchAreas capacity openSlots }
  }
`;

export const ADD_GRANT = gql`
  mutation AddGrant($input: GrantInput!) {
    addGrant(input: $input) { id title agency amount currency startDate endDate isActive }
  }
`;

/* ---------------------------- join requests ------------------------- */
export const MY_REQUESTS = gql`
  ${JOIN_REQUEST_FIELDS}
  query MyRequests($direction: RequestDirection!) {
    myJoinRequests(direction: $direction) { ...JoinRequestFields }
  }
`;

export const RESPOND_TO_REQUEST = gql`
  mutation Respond($id: ID!, $accept: Boolean!) {
    respondToJoinRequest(id: $id, accept: $accept) {
      id
      status
      project { id seatsLeft members { id name } }
      lab { id openSlots memberCount }
    }
  }
`;

export const WITHDRAW_REQUEST = gql`
  mutation Withdraw($id: ID!) {
    withdrawJoinRequest(id: $id) { id status }
  }
`;

/* ---------------------------- notifications ------------------------- */
export const NOTIFICATIONS = gql`
  ${NOTIFICATION_FIELDS}
  query Notifications {
    notifications(limit: 50) { ...NotificationFields }
    unreadNotificationCount
  }
`;

export const UNREAD_COUNT = gql`
  query UnreadCount {
    unreadNotificationCount
  }
`;

export const MARK_READ = gql`
  mutation MarkRead($ids: [ID!]) {
    markNotificationsRead(ids: $ids)
  }
`;

export const NOTIFICATION_ADDED = gql`
  ${NOTIFICATION_FIELDS}
  subscription NotificationAdded {
    notificationAdded { ...NotificationFields }
  }
`;

export const JOIN_REQUEST_CHANGED = gql`
  ${JOIN_REQUEST_FIELDS}
  subscription JoinRequestChanged {
    joinRequestChanged { ...JoinRequestFields }
  }
`;

/* ------------------------------- admin ------------------------------ */
export const ADMIN_OVERVIEW = gql`
  ${JOIN_REQUEST_FIELDS}
  query AdminOverview {
    adminStats {
      users students faculty admins labs openProjects pendingRequests unattachedStudents
      pendingVerifications activeResearchers totalCapacity filledSeats
      requests { pending accepted rejected withdrawn }
    }
    departmentStats {
      department { id name code }
      faculty students labs openSlots activeResearchers openProjects
    }
    recentJoinRequests(limit: 8) { ...JoinRequestFields }
  }
`;

export const ADMIN_USERS = gql`
  query AdminUsers {
    allUsers(limit: 500) {
      id name email role verification title program
      department { id code }
      lab { id name }
      createdAt
    }
    departments { id code name }
  }
`;

export const PENDING_VERIFICATIONS = gql`
  query PendingVerifications {
    pendingVerifications {
      id name email title createdAt interests
      department { code name }
    }
  }
`;

export const PENDING_VERIFICATION_COUNT = gql`
  query PendingVerificationCount {
    adminStats { pendingVerifications }
  }
`;

export const VERIFY_FACULTY = gql`
  mutation VerifyFaculty($userId: ID!, $approve: Boolean!) {
    verifyFaculty(userId: $userId, approve: $approve) { id verification isVerified }
  }
`;

export const DEPARTMENT_STATS = gql`
  query DepartmentStats {
    departmentStats {
      department { id name code }
      faculty students labs openSlots activeResearchers openProjects
    }
  }
`;

export const CREATE_DEPARTMENT = gql`
  mutation CreateDepartment($name: String!, $code: String!) {
    createDepartment(name: $name, code: $code) { id name code }
  }
`;

export const ADMIN_PROJECTS_LABS = gql`
  query AdminProjectsLabs {
    projects(limit: 100) {
      id title status isOpen seatsLeft maxMembers createdAt
      owner { id name role }
      lab { id name }
      members { id }
    }
    labs {
      id name capacity openSlots memberCount
      department { code }
      head { id name }
    }
  }
`;

export const SET_ROLE = gql`
  mutation SetRole($userId: ID!, $role: Role!) {
    setUserRole(userId: $userId, role: $role) { id role verification }
  }
`;

export const DELETE_USER = gql`
  mutation DeleteUser($userId: ID!) {
    deleteUser(userId: $userId)
  }
`;

/* ---------------------------- connections --------------------------- */
const CONNECTION_FIELDS = 'id connectionStatus pendingConnectionRequestId connectionCount';

export const SEND_CONNECTION_REQUEST = gql`
  mutation SendConnectionRequest($userId: ID!, $message: String) {
    sendConnectionRequest(userId: $userId, message: $message) { ${CONNECTION_FIELDS} }
  }
`;

export const RESPOND_CONNECTION = gql`
  mutation RespondConnection($id: ID!, $accept: Boolean!) {
    respondToConnectionRequest(id: $id, accept: $accept) { id status from { ${CONNECTION_FIELDS} } to { id } }
  }
`;

export const WITHDRAW_CONNECTION = gql`
  mutation WithdrawConnection($id: ID!) {
    withdrawConnectionRequest(id: $id) { id status to { ${CONNECTION_FIELDS} } }
  }
`;

export const REMOVE_CONNECTION = gql`
  mutation RemoveConnection($userId: ID!) {
    removeConnection(userId: $userId) { ${CONNECTION_FIELDS} }
  }
`;

export const CONNECTIONS_PAGE = gql`
  ${USER_CARD}
  query ConnectionsPage {
    myConnections { ...UserCard }
    incoming: connectionRequests(direction: INCOMING) { id message createdAt from { ...UserCard } }
    outgoing: connectionRequests(direction: OUTGOING) { id message createdAt to { ...UserCard } }
  }
`;

export const FIND_TEAMMATES = gql`
  ${USER_CARD}
  query FindTeammates($input: TeammateSearchInput!) {
    findTeammates(input: $input) {
      totalCount
      items {
        score
        reasons
        sharedInterests
        newSkills
        breakdown { interest skill complement }
        student { ...UserCard yearOfStudy lookingFor }
      }
    }
  }
`;

export const INVITE_TO_PROJECT = gql`
  mutation InviteToProject($projectId: ID!, $userId: ID!, $message: String) {
    inviteToProject(projectId: $projectId, userId: $userId, message: $message) { id status kind }
  }
`;

export const MY_OPEN_PROJECTS = gql`
  query MyOpenProjects {
    projects(mine: true, openOnly: true, limit: 50) { id title seatsLeft members { id } }
  }
`;

/* -------------------------------- chat ------------------------------ */
export const MESSAGE_FIELDS = gql`
  fragment MessageFields on Message {
    id
    conversationId
    kind
    body
    createdAt
    editedAt
    isDeleted
    sender { id name role }
    attachment { id name mime size isImage url }
    reactions { emoji count mine users { id name } }
  }
`;

export const CONVERSATION_SUMMARY = gql`
  ${MESSAGE_FIELDS}
  fragment ConversationSummary on Conversation {
    id
    type
    title
    memberCount
    unreadCount
    lastMessageAt
    otherUser { id name role isOnline }
    project { id title }
    lab { id name }
    lastMessage { ...MessageFields }
  }
`;

export const CONVERSATIONS = gql`
  ${CONVERSATION_SUMMARY}
  query Conversations {
    conversations { ...ConversationSummary }
  }
`;

export const CONVERSATION = gql`
  ${CONVERSATION_SUMMARY}
  query Conversation($id: ID!) {
    conversation(id: $id) {
      ...ConversationSummary
      name
      description
      canManage
      createdBy { id name }
      admins { id }
      readBy { at user { id name } }
      members { id name role title program isOnline department { code } }
      otherUser { id name role title program isOnline department { code name } }
    }
  }
`;

export const MESSAGES = gql`
  ${MESSAGE_FIELDS}
  query Messages($conversationId: ID!, $before: DateTime, $limit: Int) {
    messages(conversationId: $conversationId, before: $before, limit: $limit) {
      hasMore
      items { ...MessageFields }
    }
  }
`;

export const UNREAD_MESSAGE_COUNT = gql`
  query UnreadMessageCount {
    unreadMessageCount
  }
`;

export const CHAT_START = gql`
  query ChatStart {
    chatContacts { id name role title program department { code } }
    me { id role lab { id name } projects { id title owner { id } } }
  }
`;

export const OPEN_DIRECT = gql`
  mutation OpenDirect($userId: ID!) {
    openDirectConversation(userId: $userId) { id }
  }
`;

export const CREATE_GROUP = gql`
  mutation CreateGroup($input: GroupInput!) {
    createGroupConversation(input: $input) { id }
  }
`;

export const OPEN_PROJECT_CHAT = gql`
  mutation OpenProjectChat($projectId: ID!) {
    openProjectConversation(projectId: $projectId) { id }
  }
`;

export const OPEN_LAB_CHAT = gql`
  mutation OpenLabChat($labId: ID!) {
    openLabConversation(labId: $labId) { id }
  }
`;

export const ADD_MEMBERS = gql`
  mutation AddMembers($conversationId: ID!, $userIds: [ID!]!) {
    addConversationMembers(conversationId: $conversationId, userIds: $userIds) { id memberCount members { id name role title program department { code } } }
  }
`;

export const REMOVE_MEMBER = gql`
  mutation RemoveMember($conversationId: ID!, $userId: ID!) {
    removeConversationMember(conversationId: $conversationId, userId: $userId) { id memberCount members { id name role title program department { code } } }
  }
`;

export const LEAVE_CONVERSATION = gql`
  mutation LeaveConversation($conversationId: ID!) {
    leaveConversation(conversationId: $conversationId)
  }
`;

export const UPDATE_CONVERSATION = gql`
  mutation UpdateConversation($conversationId: ID!, $name: String, $description: String) {
    updateConversation(conversationId: $conversationId, name: $name, description: $description) { id title name description }
  }
`;

export const SEND_MESSAGE = gql`
  ${MESSAGE_FIELDS}
  mutation SendMessage($conversationId: ID!, $body: String, $attachmentId: ID) {
    sendMessage(conversationId: $conversationId, body: $body, attachmentId: $attachmentId) { ...MessageFields }
  }
`;

export const MARK_CONVERSATION_READ = gql`
  mutation MarkConversationRead($conversationId: ID!) {
    markConversationRead(conversationId: $conversationId) { id unreadCount }
  }
`;

export const MESSAGE_ADDED = gql`
  ${MESSAGE_FIELDS}
  subscription MessageAdded {
    messageAdded { ...MessageFields }
  }
`;

export const CONVERSATION_CHANGED = gql`
  subscription ConversationChanged {
    conversationChanged { id title memberCount }
  }
`;

/* ----------------------------- video calls -------------------------- */
export const SEND_CALL_SIGNAL = gql`
  mutation SendCallSignal($input: CallSignalInput!) {
    sendCallSignal(input: $input)
  }
`;

export const CALL_SIGNAL = gql`
  subscription CallSignal {
    callSignal { conversationId callId type to payload from { id name } }
  }
`;

/* --------------------------- chat extras ---------------------------- */
export const EDIT_MESSAGE = gql`
  ${MESSAGE_FIELDS}
  mutation EditMessage($id: ID!, $body: String!) {
    editMessage(id: $id, body: $body) { ...MessageFields }
  }
`;

export const DELETE_MESSAGE = gql`
  ${MESSAGE_FIELDS}
  mutation DeleteMessage($id: ID!) {
    deleteMessage(id: $id) { ...MessageFields }
  }
`;

export const TOGGLE_REACTION = gql`
  ${MESSAGE_FIELDS}
  mutation ToggleReaction($messageId: ID!, $emoji: String!) {
    toggleReaction(messageId: $messageId, emoji: $emoji) { ...MessageFields }
  }
`;

export const SET_TYPING = gql`
  mutation SetTyping($conversationId: ID!, $typing: Boolean!) {
    setTyping(conversationId: $conversationId, typing: $typing)
  }
`;

export const MESSAGE_UPDATED = gql`
  ${MESSAGE_FIELDS}
  subscription MessageUpdated {
    messageUpdated { ...MessageFields }
  }
`;

export const TYPING = gql`
  subscription Typing {
    typing { conversationId typing user { id name } }
  }
`;

export const CONVERSATION_READ = gql`
  subscription ConversationRead {
    conversationRead { conversationId userId at }
  }
`;

export const PRESENCE_CHANGED = gql`
  subscription PresenceChanged {
    presenceChanged { userId online }
  }
`;

export const PUSH_PUBLIC_KEY = gql`
  query PushPublicKey {
    pushPublicKey
  }
`;

export const SAVE_PUSH = gql`
  mutation SavePush($subscription: String!) {
    savePushSubscription(subscription: $subscription)
  }
`;

export const REMOVE_PUSH = gql`
  mutation RemovePush($endpoint: String!) {
    removePushSubscription(endpoint: $endpoint)
  }
`;
