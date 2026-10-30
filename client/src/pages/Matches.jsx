import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { RECOMMENDED_MENTORS } from '../graphql/operations.js';
import MatchBar, { COMPONENTS, DEFAULT_WEIGHTS } from '../components/MatchBar.jsx';
import PersonRow from '../components/PersonRow.jsx';
import { Loading, ErrorNote, Empty } from '../components/ui.jsx';

/** Ranked mentor recommendations, with sliders that re-weight the scoring model live. */
export default function Matches() {
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const deferred = useDeferredValue(weights);
  const { data, loading, error, previousData } = useQuery(RECOMMENDED_MENTORS, {
    variables: { limit: 10, weights: deferred },
  });
  const list = (data ?? previousData)?.recommendedMentors;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My matches</h1>
          <p className="muted">
            Faculty ranked against your skills and interests. Rare shared skills count for more than common
            ones, and people who published recently rank higher. <Link to="/profile/edit">Update your profile</Link> to
            improve these.
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-title">
          <h3>What matters most to you</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeights(DEFAULT_WEIGHTS)}>Reset</button>
        </div>
        <div className="weights">
          {COMPONENTS.map((c) => (
            <label key={c.key} style={{ '--c': c.color }}>
              <span>{c.label}<em className="faint">{Math.round(weights[c.key] * 100)}</em></span>
              <input
                type="range" min={0} max={1} step={0.05} value={weights[c.key]}
                onChange={(e) => setWeights({ ...weights, [c.key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
      </section>

      <ErrorNote error={error} />
      {!list && loading && <Loading what="Ranking faculty" />}
      {list?.length === 0 && (
        <Empty>
          <p>Add a few skills and interests to your profile to get matches.</p>
          <p><Link to="/profile/edit">Edit profile</Link></p>
        </Empty>
      )}
      <div style={{ marginTop: 10, opacity: loading && list ? 0.6 : 1 }}>
        {list?.map((m) => (
          <div className="match-row" key={m.faculty.id}>
            <div style={{ borderBottom: 0 }}>
              <PersonRow user={m.faculty} />
            </div>
            <div style={{ paddingTop: 16 }}>
              <MatchBar score={m.score} breakdown={m.breakdown} weights={deferred} reasons={m.reasons} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
