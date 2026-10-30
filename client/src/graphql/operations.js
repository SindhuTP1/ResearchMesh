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
      lab { id name }
    }
  }
`;

export const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) { token user { id name role } }
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

/* ------------------------------ profile ----------------------------- */
export const USER_PROFILE = gql`
  ${USER_CARD}
  ${PROJECT_CARD}
  query UserProfile($id: ID!) {
    user(id: $id) {
      ...UserCard
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

export const CONNECT = gql`
  mutation Connect($userId: ID!) {
    connect(userId: $userId) { id connectionCount }
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
  query Projects($status: ProjectStatus, $openOnly: Boolean, $tag: String) {
    projects(status: $status, openOnly: $openOnly, tag: $tag) { ...ProjectCard }
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
  query AdminOverview {
    adminStats { users students faculty labs openProjects pendingRequests unattachedStudents }
    allUsers(limit: 200) { id name email role department { code } lab { name } createdAt }
  }
`;

export const SET_ROLE = gql`
  mutation SetRole($userId: ID!, $role: Role!) {
    setUserRole(userId: $userId, role: $role) { id role }
  }
`;

export const DELETE_USER = gql`
  mutation DeleteUser($userId: ID!) {
    deleteUser(userId: $userId)
  }
`;
