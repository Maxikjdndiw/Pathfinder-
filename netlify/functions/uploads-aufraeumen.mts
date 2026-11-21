/**
 * Scheduled function, once a day: deletes uploaded files older than 30 days.
 * Only the number of deleted files goes to the log, never names or contents.
 */
import { cleanUp } from './_shared/uploads';

export default async () => {
  const n = await cleanUp();
  console.log(JSON.stringify({ aufgeraeumt: n }));
};

export const config = { schedule: '@daily' };
