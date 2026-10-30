import { Notification, User } from '../models/index.js';
import { pubsub, EVENTS } from '../pubsub.js';
import { opportunityFits } from './matching.js';

/** Persist a notification and push it to the recipient's live subscription. */
export async function notify({ recipient, type, message, actor, project, lab, joinRequest }) {
  const doc = await Notification.create({ recipient, type, message, actor, project, lab, joinRequest });
  const plain = doc.toObject();
  await pubsub.publish(EVENTS.NOTIFICATION_ADDED, { notificationAdded: plain });
  return plain;
}

export async function publishJoinRequest(jr) {
  const plain = typeof jr.toObject === 'function' ? jr.toObject() : jr;
  await pubsub.publish(EVENTS.JOIN_REQUEST_CHANGED, { joinRequestChanged: plain });
}

/**
 * "Notify me when a new opening matches my interests."
 * Finds students looking for a lab/project whose interests overlap the opportunity, scores them with the
 * matching engine, and notifies those above threshold. Runs after the mutation responds (fire-and-forget).
 */
export async function notifyMatchingStudents({ areas = [], requiredSkills = [], message, lab, project, actor, excludeIds = [] }) {
  const terms = [...new Set([...areas, ...requiredSkills].map((t) => t.toLowerCase()))];
  if (!terms.length) return 0;

  const candidates = await User.find({
    role: 'STUDENT',
    _id: { $nin: excludeIds },
    $or: [{ interests: { $in: terms } }, { 'skills.name': { $in: terms } }],
    ...(lab && !project ? { lab: null } : {}),
  })
    .select('interests skills')
    .limit(200)
    .lean();

  let sent = 0;
  for (const s of candidates) {
    const { fits, score } = opportunityFits(s, { areas, requiredSkills });
    if (!fits) continue;
    await notify({
      recipient: s._id,
      type: 'MATCHING_OPENING',
      message: `${message} (match ${(score * 100).toFixed(0)}%)`,
      lab,
      project,
      actor,
    });
    sent += 1;
  }
  return sent;
}
