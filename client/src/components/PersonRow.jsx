import { Link } from 'react-router-dom';
import { Avatar, Skills, Interests } from './ui.jsx';

/** Compact person row used by search results — renders only the UserCard fragment fields. */
export default function PersonRow({ user, highlightSkills = [], highlightArea = '', side }) {
  const sub = [
    user.title || user.program,
    user.department?.code,
    user.lab ? user.lab.name : user.role === 'STUDENT' ? 'Not in a lab yet' : null,
  ].filter(Boolean);
  return (
    <div className="person">
      <Avatar user={user} />
      <div>
        <Link className="name" to={`/people/${user.id}`}>{user.name}</Link>
        <div className="sub">{sub.join(', ')}</div>
        <Interests items={user.interests} highlight={highlightArea} />
        <Skills skills={user.skills} highlight={highlightSkills} max={6} />
      </div>
      <div className="side">
        {side}
        {user.role === 'FACULTY' && (
          <>
            {user.lab && (
              <span className="slots">
                {user.lab.openSlots > 0 ? <><strong>{user.lab.openSlots}</strong> open {user.lab.openSlots === 1 ? 'slot' : 'slots'}</> : 'Lab full'}
              </span>
            )}
            <span className="slots">
              {user.recentPublicationCount > 0
                ? `${user.recentPublicationCount} paper${user.recentPublicationCount === 1 ? '' : 's'} in the last 2 years`
                : 'No papers in the last 2 years'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
